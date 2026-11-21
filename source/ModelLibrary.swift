import AppKit
import CryptoKit
import Foundation

final class ModelLibrary {
  let root: URL
  let queue = DispatchQueue(label: "CyMalikaModelLibrary", qos: .userInitiated)
  let lock = NSLock()
  var jobs: [String: [String: Any]] = [:]
  var plans: [String: [String: Any]] = [:]
  var transfers: [String: URLSessionTask] = [:]
  var streams: [String: ModelStream] = [:]
  var workers: [String: Process] = [:]
  var server: Process?
  init(_ root: URL) { self.root = root }
  @discardableResult func locked<T>(_ work: () throws -> T) rethrows -> T { lock.lock(); defer { lock.unlock() }; return try work() }
  func update(_ id: String, _ values: [String: Any]) { locked { guard jobs[id]?["state"] as? String == "running" else { return }; jobs[id]?.merge(values) { _, v in v } } }
  func active(_ id: String) -> Bool { locked { jobs[id]?["state"] as? String == "running" } }
  func newJob(_ kind: String, _ name: String) throws -> String {
    try locked {
      guard jobs.values.filter({ $0["state"] as? String == "running" }).count < 3 else { throw Failure("Finish or cancel a current download first.") }
      if jobs.count >= 20 { jobs = jobs.filter { $0.value["state"] as? String == "running" } }
      let id = UUID().uuidString
      jobs[id] = ["id": id, "kind": kind, "name": name, "state": "running", "status": "Starting…", "completed": 0, "total": 0]
      return id
    }
  }
  func endpoint(_ raw: String) throws -> String {
    guard let u = URL(string: raw), u.scheme == "http", ["localhost", "127.0.0.1", "::1"].contains(u.host ?? ""), u.user == nil, u.password == nil, ["", "/"].contains(u.path), u.query == nil, u.fragment == nil else { throw Failure("Model management needs a local Ollama URL, such as http://localhost:11434.") }
    return raw.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
  }
  func modelName(_ raw: String) throws -> String {
    let name = raw.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !name.isEmpty, name.count <= 300, name.range(of: "^[a-zA-Z0-9][a-zA-Z0-9_.:/-]*$", options: .regularExpression) != nil, !name.contains(".."), !name.contains("://"), !name.components(separatedBy: "/").contains("") else { throw Failure("Enter an Ollama model ID or hf.co/owner/GGUF-repository:quantization.") }
    return name
  }
  func fetch(_ raw: String, timeout: Double = 8) throws -> Data {
    guard let url = URL(string: raw) else { throw Failure("Invalid model service URL.") }
    var request = URLRequest(url: url); request.timeoutInterval = timeout
    request.setValue("CyMalika-model-library", forHTTPHeaderField: "User-Agent")
    let semaphore = DispatchSemaphore(value: 0)
    var outcome: Result<Data, Error> = .failure(Failure("Service request did not finish."))
    let client = URLSession(configuration: .ephemeral)
    let task = client.dataTask(with: request) { data, response, error in
      defer { semaphore.signal() }
      if let error { outcome = .failure(error); return }
      guard let data, data.count <= 8_000_000, let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else { outcome = .failure(Failure("The model service returned an invalid response.")); return }
      outcome = .success(data)
    }
    task.resume()
    if semaphore.wait(timeout: .now() + timeout + 2) == .timedOut { task.cancel(); client.invalidateAndCancel(); throw Failure("The model service timed out.") }
    client.finishTasksAndInvalidate()
    return try outcome.get()
  }
  func json(_ raw: String, timeout: Double = 8) throws -> [String: Any] { try JSONSerialization.jsonObject(with: fetch(raw, timeout: timeout)) as? [String: Any] ?? [:] }
  func binary() -> URL? {
    [root.appendingPathComponent("runtime/ollama"), root.appendingPathComponent("runtime/bin/ollama"), URL(fileURLWithPath: "/Applications/Ollama.app/Contents/Resources/ollama"), URL(fileURLWithPath: "/opt/homebrew/bin/ollama"), URL(fileURLWithPath: "/usr/local/bin/ollama")].first { FileManager.default.isExecutableFile(atPath: $0.path) }
  }
  func status() -> [String: Any] {
    var found: String?
    for base in ["http://127.0.0.1:11434", "http://127.0.0.1:11435"] { if (try? json(base + "/api/version", timeout: 1.5)) != nil { found = base; break } }
    try? FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
    let disk = try? FileManager.default.attributesOfFileSystem(forPath: root.path)
    return ["endpoint": found as Any? ?? NSNull(), "installed": binary() != nil, "managedRunning": server?.isRunning == true, "managedEndpoint": "http://127.0.0.1:11435", "ram": ProcessInfo.processInfo.physicalMemory, "freeDisk": disk?[.systemFreeSize] ?? 0, "modelDirectory": root.appendingPathComponent("models").path]
  }
  func plan() throws -> [String: Any] {
    guard #available(macOS 14, *) else { throw Failure("The current Ollama runtime requires macOS 14 or newer. You can still connect an existing compatible API.") }
    let release = try json("https://api.github.com/repos/ollama/ollama/releases/latest")
    let version = release["tag_name"] as? String ?? "", name = "ollama-darwin.tgz"
    guard version.range(of: "^v[0-9][a-zA-Z0-9.\\-]*$", options: .regularExpression) != nil,
      let asset = (release["assets"] as? [[String: Any]])?.first(where: { $0["name"] as? String == name }), let digest = asset["digest"] as? String, digest.range(of: "^sha256:[a-f0-9]{64}$", options: .regularExpression) != nil, let raw = asset["browser_download_url"] as? String, raw == "https://github.com/ollama/ollama/releases/download/\(version)/\(name)", let size = asset["size"] as? Int else { throw Failure("The official runtime package has no verifiable SHA-256 digest. Nothing was installed.") }
    let id = UUID().uuidString
    let result: [String: Any] = ["id": id, "version": version, "name": name, "sha256": String(digest.dropFirst(7)), "size": size, "url": raw]
    plans = [id: result]
    return result
  }
  func pull(_ args: [String: Any]) throws -> [String: Any] {
    let base = try endpoint(args["endpoint"] as? String ?? ""), name = try modelName(args["name"] as? String ?? "")
    guard !locked({ jobs.values.contains { $0["state"] as? String == "running" && $0["name"] as? String == name } }) else { throw Failure("This model is already downloading.") }
    let id = try newJob("model", name)
    var request = URLRequest(url: URL(string: base + "/api/pull")!)
    request.httpMethod = "POST"; request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.httpBody = try JSONSerialization.data(withJSONObject: ["model": name, "stream": true])
    var success = false
    let stream = ModelStream(request: request, maxBytes: 1_000_000_000, idleTimeout: 300, resourceTimeout: 86400, onLine: { line in
      guard let data = line.data(using: .utf8), let item = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] else { return }
      if let error = item["error"] as? String { self.update(id, ["state": "failed", "status": String(error.prefix(800))]); return }
      if item["status"] as? String == "success" { success = true }
      self.update(id, ["status": item["status"] as? String ?? "Downloading", "completed": item["completed"] ?? 0, "total": item["total"] ?? 0])
    }, onEnd: { error in
      self.locked { self.streams.removeValue(forKey: id) }
      self.queue.async {
        guard self.active(id) else { return }
        do {
          if let error { throw error }
          guard success else { throw Failure("Download ended without a success confirmation.") }
          let tags = try self.json(base + "/api/tags")["models"] as? [[String: Any]] ?? []
          guard tags.contains(where: { $0["name"] as? String == name || $0["name"] as? String == name + ":latest" || $0["model"] as? String == name }) else { throw Failure("The engine ended the download but the model is absent from its installed list.") }
          self.update(id, ["state": "complete", "status": "Downloaded and verified in the installed-model list."])
        } catch { self.update(id, ["state": "failed", "status": error.localizedDescription]) }
      }
    })
    locked { streams[id] = stream }
    stream.start()
    return locked { jobs[id]! }
  }
  func cancel(_ id: String) -> [String: Any] {
    locked {
      if jobs[id]?["state"] as? String == "running" {
        jobs[id]?["state"] = "cancelled"; jobs[id]?["status"] = "Cancelled. Download the same model ID again to resume."
        streams[id]?.cancel(); transfers[id]?.cancel()
        if workers[id]?.isRunning == true { workers[id]?.terminate() }
      }
    }
    return ["status": "cancelled"]
  }
  func runProcess(_ id: String, _ executable: String, _ arguments: [String]) throws -> String {
    guard active(id) else { throw Failure("Cancelled.") }
    let p = Process(), pipe = Pipe(); p.executableURL = URL(fileURLWithPath: executable); p.arguments = arguments
    p.standardOutput = pipe; p.standardError = pipe
    locked { workers[id] = p }
    defer { locked { workers.removeValue(forKey: id) } }
    try p.run()
    var data = Data()
    while let part = try pipe.fileHandleForReading.read(upToCount: 65536), !part.isEmpty { data.append(part); if data.count > 2_000_000 { p.terminate(); throw Failure("Runtime extraction response exceeded its limit.") } }
    p.waitUntilExit()
    guard p.terminationStatus == 0 else { throw Failure("Runtime extraction failed.") }
    return String(data: data, encoding: .utf8) ?? ""
  }
  func install(_ args: [String: Any]) throws -> [String: Any] {
    let token = args["plan"] as? String ?? ""
    guard let plan = plans[token] else { throw Failure("Review the runtime download again.") }
    guard server?.isRunning != true, !locked({ jobs.values.contains { $0["kind"] as? String == "runtime" && $0["state"] as? String == "running" } }) else { throw Failure("Stop the managed engine or finish its installation first.") }
    plans.removeValue(forKey: token)
    let id = try newJob("runtime", plan["name"] as? String ?? "Ollama")
    DispatchQueue.global(qos: .utility).async { self.runInstall(id, plan) }
    return locked { jobs[id]! }
  }
  func runInstall(_ id: String, _ plan: [String: Any]) {
    let fm = FileManager.default, stage = root.appendingPathComponent("install-" + id)
    defer { try? fm.removeItem(at: stage) }
    do {
      try fm.createDirectory(at: stage, withIntermediateDirectories: true)
      let archive = stage.appendingPathComponent("runtime.tgz"), target = stage.appendingPathComponent("runtime")
      update(id, ["status": "Downloading official Ollama runtime", "total": plan["size"] ?? 0])
      let semaphore = DispatchSemaphore(value: 0)
      var failure: Error?
      let config = URLSessionConfiguration.ephemeral; config.timeoutIntervalForRequest = 300; config.timeoutIntervalForResource = 86400
      let client = URLSession(configuration: config)
      let task = client.downloadTask(with: URL(string: plan["url"] as! String)!) { file, response, error in
        defer { semaphore.signal() }
        do {
          if let error { throw error }
          guard let file, let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else { throw Failure("The runtime download failed.") }
          try fm.moveItem(at: file, to: archive)
        } catch { failure = error }
      }
      locked { transfers[id] = task }; task.resume(); semaphore.wait()
      locked { transfers.removeValue(forKey: id) }; client.finishTasksAndInvalidate()
      if let failure { throw failure }; guard active(id) else { return }
      let file = try FileHandle(forReadingFrom: archive); defer { try? file.close() }
      var hash = SHA256(), count = 0
      while let part = try file.read(upToCount: 1_048_576), !part.isEmpty { hash.update(data: part); count += part.count }
      let digest = hash.finalize().map { String(format: "%02x", $0) }.joined()
      guard count == plan["size"] as? Int, digest == plan["sha256"] as? String else { throw Failure("Runtime checksum verification failed. Nothing was installed.") }
      update(id, ["status": "Verified SHA-256. Extracting runtime…", "completed": count])
      try fm.createDirectory(at: target, withIntermediateDirectories: true)
      let listing = try runProcess(id, "/usr/bin/tar", ["-tf", archive.path])
      guard !listing.components(separatedBy: .newlines).contains(where: { $0.hasPrefix("/") || $0.contains("\\") || $0.components(separatedBy: "/").contains("..") }) else { throw Failure("Unsafe runtime archive paths.") }
      _ = try runProcess(id, "/usr/bin/tar", ["-xf", archive.path, "-C", target.path])
      guard active(id) else { return }
      guard [target.appendingPathComponent("ollama"), target.appendingPathComponent("bin/ollama")].contains(where: { fm.isExecutableFile(atPath: $0.path) }) else { throw Failure("The official package contains no expected engine executable.") }
      let destination = root.appendingPathComponent("runtime"), backup = root.appendingPathComponent("previous-runtime")
      try? fm.removeItem(at: backup)
      let old = fm.fileExists(atPath: destination.path)
      if old { try fm.moveItem(at: destination, to: backup) }
      do { try fm.moveItem(at: target, to: destination) } catch { if old { try? fm.moveItem(at: backup, to: destination) }; throw error }
      try? fm.removeItem(at: backup)
      update(id, ["state": "complete", "status": "Ollama \(plan["version"] ?? "") installed. Start the engine to download a model."])
    } catch { update(id, ["state": "failed", "status": error.localizedDescription]) }
  }
  func start(_ args: [String: Any]) throws -> [String: Any] {
    if server?.isRunning == true { return ["endpoint": "http://127.0.0.1:11435"] }
    guard (try? json("http://127.0.0.1:11435/api/version", timeout: 1)) == nil else { throw Failure("Port 11435 is used by another engine. Connect to it instead.") }
    guard let binary = binary() else { throw Failure("Install the local engine first.") }
    let max = args["maxLoaded"] as? Int ?? 3
    guard (1...64).contains(max) else { throw Failure("Choose between 1 and 64 loaded models.") }
    let p = Process(); p.executableURL = binary; p.arguments = ["serve"]
    var env = ProcessInfo.processInfo.environment; env["OLLAMA_HOST"] = "127.0.0.1:11435"; env["OLLAMA_MAX_LOADED_MODELS"] = String(max)
    if binary.path.hasPrefix(root.path + "/") { let models = root.appendingPathComponent("models"); try FileManager.default.createDirectory(at: models, withIntermediateDirectories: true); env["OLLAMA_MODELS"] = models.path }
    p.environment = env; p.standardOutput = FileHandle.nullDevice; p.standardError = FileHandle.nullDevice
    try p.run(); server = p
    for _ in 0..<60 {
      guard p.isRunning else { server = nil; throw Failure("The local engine exited. Check OS compatibility and GPU drivers.") }
      if (try? json("http://127.0.0.1:11435/api/version", timeout: 0.5)) != nil { return ["endpoint": "http://127.0.0.1:11435"] }
      Thread.sleep(forTimeInterval: 0.25)
    }
    _ = stop(); throw Failure("The engine did not become ready.")
  }
  func stop() -> [String: Any] { if server?.isRunning == true { server?.terminate() }; server = nil; return ["status": "stopped"] }
  func close() { for id in locked({ Array(jobs.keys) }) { _ = cancel(id) }; _ = stop() }
  func handle(_ args: [String: Any], completion: @escaping (Result<Any, Error>) -> Void) {
    queue.async {
      do {
        let result: Any
        switch args["operation"] as? String {
        case "status": result = self.status()
        case "plan": result = try self.plan()
        case "install": result = try self.install(args)
        case "start": result = try self.start(args)
        case "stop": result = self.stop()
        case "pull": result = try self.pull(args)
        case "cancel": result = self.cancel(args["id"] as? String ?? "")
        case "jobs": result = self.locked { self.jobs.map { id, item -> [String: Any] in var row = item; if let task = self.transfers[id] { row["completed"] = task.countOfBytesReceived }; return row } }
        default: throw Failure("Unknown model library operation.")
        }
        completion(.success(result))
      } catch { completion(.failure(error)) }
    }
  }
}
