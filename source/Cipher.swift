import AppKit
import ApplicationServices
import CryptoKit
import Darwin
import UniformTypeIdentifiers
import WebKit

struct Failure: Error, LocalizedError {
  let message: String
  var errorDescription: String? { message }
  init(_ s: String) { message = s }
}
func digest(_ s: String) -> String {
  SHA256.hash(data: Data(s.utf8)).map { String(format: "%02x", $0) }.joined()
}
final class Workspace {
  var root: URL?
  let fm = FileManager.default
  var proposals: [String: [String: Any]] = [:]
  var revisions: [[String: Any]] = []
  let storage: URL
  init(storage: URL) {
    self.storage = storage
    try? fm.createDirectory(at: storage, withIntermediateDirectories: true)
  }
  func select(_ url: URL) {
    root = url.resolvingSymlinksInPath().standardizedFileURL
    proposals = [:]
    revisions =
      (try? JSONSerialization.jsonObject(
        with: Data(contentsOf: storage.appendingPathComponent("revisions.json"))))
      as? [[String: Any]] ?? []
  }
  func resolve(_ path: String) throws -> URL {
    guard let root else { throw Failure("Open a project first.") }
    guard !path.isEmpty, !path.hasPrefix("/"), !path.split(separator: "/").contains(".."),
      !path.contains("\0")
    else { throw Failure("Use a relative path inside this project.") }
    var check = root
    for component in path.split(separator: "/") {
      check.appendPathComponent(String(component))
      if let attrs = try? fm.attributesOfItem(atPath: check.path),
        attrs[.type] as? FileAttributeType == .typeSymbolicLink
      {
        throw Failure("Symbolic-link paths are excluded from project tools.")
      }
    }
    let url = root.appendingPathComponent(path).standardizedFileURL.resolvingSymlinksInPath()
    guard url.path.hasPrefix(root.path + "/") else {
      throw Failure("This path leaves the selected project.")
    }
    let parts = path.split(separator: "/").map(String.init)
    guard !parts.contains(".git"), !parts.contains(".ssh"), !parts.contains(".aws"),
      !parts.contains(where: {
        $0 == ".env" || $0.hasPrefix(".env.") || $0.hasSuffix(".pem") || $0.hasSuffix(".key")
      })
    else { throw Failure("Credential and Git-internal files are excluded.") }
    return url
  }
  func read(_ path: String) throws -> [String: Any] {
    let url = try resolve(path)
    let attrs = try fm.attributesOfItem(atPath: url.path)
    guard attrs[.type] as? FileAttributeType == .typeRegular else {
      throw Failure("This is not a regular file.")
    }
    guard (attrs[.size] as? NSNumber)?.intValue ?? 0 <= 1_000_000 else {
      throw Failure("File exceeds the 1 MB read limit.")
    }
    let text = try String(contentsOf: url, encoding: .utf8)
    return ["path": path, "content": text, "hash": digest(text)]
  }
  func files(_ excluded: [String] = []) throws -> [String] {
    guard let root else { throw Failure("Open a project first.") }
    let skips = Set(
      [
        ".git", "node_modules", ".venv", "venv", "vendor", "build", "dist", ".next", ".DS_Store",
        ".idea", ".cache", "__pycache__",
      ] + excluded)
    guard
      let iterator = fm.enumerator(
        at: root, includingPropertiesForKeys: [.isDirectoryKey, .isSymbolicLinkKey],
        options: [.skipsHiddenFiles])
    else { return [] }
    var result: [String] = []
    while let url = iterator.nextObject() as? URL {
      let relative = String(url.path.dropFirst(root.path.count + 1))
      if skips.contains(url.lastPathComponent) || relative.split(separator: "/").count > 12 {
        iterator.skipDescendants()
        continue
      }
      let info = try? url.resourceValues(forKeys: [.isDirectoryKey, .isSymbolicLinkKey])
      if info?.isSymbolicLink == true {
        iterator.skipDescendants()
        continue
      }
      if info?.isDirectory == true { continue }
      if (try? resolve(relative)) == nil { continue }
      result.append(relative)
      if result.count >= 5000 { break }
    }
    return result.sorted()
  }
  func prepare(_ path: String, _ content: String, _ expected: String?) throws -> [String: Any] {
    let url = try resolve(path)
    guard content.utf8.count <= 1_000_000 else { throw Failure("Proposed file exceeds 1 MB.") }
    let exists = fm.fileExists(atPath: url.path)
    let old = exists ? try read(path)["content"] as! String : ""
    if let expected, !expected.isEmpty, expected != digest(old) {
      throw Failure("File changed since it was read. Read it again before editing.")
    }
    if exists && (expected == nil || expected!.isEmpty) {
      throw Failure("Read the existing file first and pass its hash as expected_hash.")
    }
    let id = UUID().uuidString
    let record: [String: Any] = [
      "id": id, "path": path, "before": old, "after": content, "beforeHash": digest(old),
      "afterHash": digest(content), "existed": exists, "root": root!.path,
      "date": ISO8601DateFormatter().string(from: Date()),
    ]
    proposals[id] = record
    return record
  }
  func apply(_ id: String) throws -> [String: Any] {
    guard let p = proposals[id], p["root"] as? String == root?.path else {
      throw Failure("This proposal has expired.")
    }
    let path = p["path"] as! String
    let url = try resolve(path)
    let exists = fm.fileExists(atPath: url.path)
    let current = exists ? try read(path)["content"] as! String : ""
    guard exists == (p["existed"] as! Bool), digest(current) == p["beforeHash"] as! String else {
      throw Failure("The file changed outside Cipher. Request a fresh edit.")
    }
    revisions.append(p)
    try persistRevisions()
    try fm.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
    try (p["after"] as! String).write(to: url, atomically: true, encoding: .utf8)
    proposals.removeValue(forKey: id)
    return ["status": "saved", "path": path, "hash": p["afterHash"]!, "revision": id]
  }
  func undo(_ id: String) throws -> [String: Any] {
    guard
      let index = revisions.firstIndex(where: {
        $0["id"] as? String == id && $0["root"] as? String == root?.path
          && $0["undone"] as? Bool != true
      })
    else { throw Failure("No active checkpoint found.") }
    let p = revisions[index]
    let path = p["path"] as! String
    let url = try resolve(path)
    let current = try read(path)["content"] as! String
    guard digest(current) == p["afterHash"] as! String else {
      throw Failure("File changed since this checkpoint. Undo would overwrite newer work.")
    }
    if p["existed"] as! Bool {
      try (p["before"] as! String).write(to: url, atomically: true, encoding: .utf8)
    } else {
      try fm.removeItem(at: url)
    }
    revisions[index]["undone"] = true
    try persistRevisions()
    return ["status": "restored", "path": path]
  }
  func persistRevisions() throws {
    try JSONSerialization.data(withJSONObject: revisions, options: [.prettyPrinted]).write(
      to: storage.appendingPathComponent("revisions.json"), options: .atomic)
  }
}

final class ComputerOperationCancellation {
  private let lock = NSLock()
  private var stopped = false
  var cancelled: Bool { lock.lock(); defer { lock.unlock() }; return stopped }
  func cancel() { lock.lock(); stopped = true; lock.unlock() }
}
final class Bridge: NSObject, WKScriptMessageHandler, WKNavigationDelegate {
  let coffee = CoffeeAwake()
  weak var web: WKWebView?
  let workspace: Workspace
  let policy = AccessPolicy()
  lazy var modelLibrary = ModelLibrary(workspace.storage.appendingPathComponent("local-models"))
  lazy var computer = ComputerController(policy)
  lazy var browser = BrowserController(policy)
  lazy var personalFiles = PersonalFiles(storage: workspace.storage.appendingPathComponent("computer-files"))
  var commandDirectories: [String: URL] = [:]
  let computerIOQueue = DispatchQueue(label: "CipherComputerFiles", qos: .userInitiated)
  var computerOperations: [String: ComputerOperationCancellation] = [:]
  var computerBaseGrants: Set<String> = ["files", "edits", "commands", "git"]
  var streams: [String: ModelStream] = [:]
  var tasks: [String: URLSessionDataTask] = [:]
  var rendererRecoveryPending = false
  var commands: [String: String] = [:]
  var processes: [String: Process] = [:]
  init(storage: URL) { workspace = Workspace(storage: storage) }
  func reply(_ id: String, _ value: Any = NSNull(), error: String? = nil) {
    let payload: [String: Any] = ["id": id, "result": value, "error": error as Any? ?? NSNull()]
    guard let data = try? JSONSerialization.data(withJSONObject: payload),
      let json = String(data: data, encoding: .utf8)
    else { return }
    DispatchQueue.main.async {
      self.web?.evaluateJavaScript("window.receiveNative(\(json))", completionHandler: nil)
    }
  }
  func userContentController(
    _ controller: WKUserContentController, didReceive message: WKScriptMessage
  ) {
    guard message.frameInfo.isMainFrame, let b = message.body as? [String: Any],
      let id = b["id"] as? String, let action = b["action"] as? String
    else { return }
    let args = b["args"] as? [String: Any] ?? [:]
    do {
      switch action {
      case "modelLibrary":
        modelLibrary.handle(args) { result in
          switch result {
          case .success(let value): self.reply(id, value)
          case .failure(let error): self.reply(id, error: error.localizedDescription)
          }
        }
      case "coffeeStatus": reply(id, ["enabled": coffee.enabled])
      case "setCoffee":
        guard let enabled = args["enabled"] as? Bool else { throw Failure("Coffee needs an on/off value.") }
        reply(id, try coffee.setEnabled(enabled))
      case "loadState":
        let data = try? Data(contentsOf: workspace.storage.appendingPathComponent("state.json"))
        var state = (data.flatMap { try? JSONSerialization.jsonObject(with: $0) }) as? [String: Any] ?? [:]
        if rendererRecoveryPending {
          state["runtimeNotice"] = "Cipher recovered after its interface stopped. Pending work was cancelled; app access was disconnected. Saved conversations are in Chats. Reopen your project or reconnect an app before starting a new task."
          rendererRecoveryPending = false
        }
        reply(id, state)
      case "saveState":
        let data = try JSONSerialization.data(withJSONObject: args)
        guard data.count < 8_000_000 else {
          throw Failure("Chat storage limit reached. Start a new chat.")
        }
        try data.write(to: workspace.storage.appendingPathComponent("state.json"), options: .atomic)
        reply(id, true)
      case "chooseProject":
        let panel = NSOpenPanel()
        panel.canChooseFiles = false
        panel.canChooseDirectories = true
        panel.allowsMultipleSelection = false
        panel.message = "Choose the project Cipher may work in."
        if panel.runModal() == .OK, let url = panel.url {
          workspace.select(url)
          reply(
            id,
            [
              "path": url.path, "name": url.lastPathComponent,
              "files": try workspace.files(args["excludes"] as? [String] ?? []),
            ])
        } else {
          reply(id)
        }
      case "openProject":
        // Only previously chosen projects may be restored by the app.
        let path = args["path"] as? String ?? ""
        let data = try? Data(contentsOf: workspace.storage.appendingPathComponent("state.json"))
        let state =
          data.flatMap { try? JSONSerialization.jsonObject(with: $0) } as? [String: Any] ?? [:]
        let recent = state["projects"] as? [[String: Any]] ?? []
        guard recent.contains(where: { $0["path"] as? String == path }) else {
          throw Failure("Choose this project with Open Project first.")
        }
        var isDir: ObjCBool = false
        guard FileManager.default.fileExists(atPath: path, isDirectory: &isDir), isDir.boolValue
        else { throw Failure("Project folder is no longer available.") }
        workspace.select(URL(fileURLWithPath: path))
        reply(
          id,
          [
            "path": path, "name": URL(fileURLWithPath: path).lastPathComponent,
            "files": try workspace.files(args["excludes"] as? [String] ?? []),
          ])
      case "listFiles":
        try policy.require("files")
        reply(id, try workspace.files(args["excludes"] as? [String] ?? []))
      case "readFile":
        try policy.require("files")
        reply(id, try workspace.read(args["path"] as? String ?? ""))
      case "search":
        try policy.require("files")
        let query = args["query"] as? String ?? ""
        guard query.count >= 2 else { throw Failure("Search needs at least two characters.") }
        var hits: [[String: Any]] = []
        let pathFilter = args["path_contains"] as? String ?? ""
        let searchPaths = try workspace.files(args["excludes"] as? [String] ?? []).filter {
          pathFilter.isEmpty || $0.localizedCaseInsensitiveContains(pathFilter)
        }.sorted {
          let a = ["md", "txt", "rst"].contains(URL(fileURLWithPath: $0).pathExtension.lowercased())
          let b = ["md", "txt", "rst"].contains(URL(fileURLWithPath: $1).pathExtension.lowercased())
          return a == b ? $0 < $1 : !a
        }
        for path in searchPaths {
          guard let text = try? workspace.read(path)["content"] as? String else { continue }
          for (i, line) in text.components(separatedBy: "\n").enumerated()
          where line.localizedCaseInsensitiveContains(query) {
            hits.append(["path": path, "line": i + 1, "text": String(line.prefix(350))])
            if hits.count >= 60 { break }
          }
          if hits.count >= 60 { break }
        }
        reply(id, hits)
      case "prepareWrite":
        try policy.require("edits")
        reply(
          id,
          try workspace.prepare(
            args["path"] as? String ?? "", args["content"] as? String ?? "",
            args["expected_hash"] as? String))
      case "applyWrite":
        try policy.require("edits")
        reply(id, try workspace.apply(args["proposal"] as? String ?? ""))
      case "rejectWrite":
        workspace.proposals.removeValue(forKey: args["proposal"] as? String ?? "")
        reply(id, true)
      case "undo": reply(id, try workspace.undo(args["revision"] as? String ?? ""))
      case "revisions":
        reply(
          id,
          workspace.revisions.filter {
            $0["root"] as? String == workspace.root?.path && $0["undone"] as? Bool != true
          }.reversed().map { $0 })
      case "prepareCommand":
        try policy.require("commands")
        guard workspace.root != nil else { throw Failure("Open a project first.") }
        let command = args["command"] as? String ?? ""
        guard !command.isEmpty, command.count <= 5000 else { throw Failure("Invalid command.") }
        let key = UUID().uuidString
        commands[key] = command
        reply(id, ["id": key, "command": command, "cwd": workspace.root!.path])
      case "executeCommand":
        try policy.require("commands")
        executeCommand(id, args)
      case "request": network(id, args)
      case "stream": startStream(id, args)
      case "accessStatus": reply(id, computer.status())
      case "runningApps": reply(id, computer.runningApps())
      case "setComputerAccess":
        guard let enabled = args["enabled"] as? Bool else { throw Failure("Computer access needs an on/off value.") }
        cancelWork()
        if enabled && !policy.fullComputer { computerBaseGrants = policy.grants.intersection(["files", "edits", "commands", "git"]) }
        policy.fullComputer = enabled
        policy.grants = enabled ? ["files", "edits", "commands", "git", "computer", "browser"] : computerBaseGrants
        policy.apps = []
        policy.origins = []
        if !enabled { browser.close() }
        var status = computer.status()
        status["enabled"] = enabled
        status["home"] = personalFiles.home.path
        reply(id, status)
      case "computerApps":
        try requireComputerAccess()
        let running = computer.runningApps()
        computerOperation(id, work: { [self] in ["running": running, "available": computer.installedApps()] }, commit: { [self] value in
          let result = value as? [String: Any] ?? [:]
          computer.availableAppIDs = Set((result["available"] as? [[String: String]] ?? []).compactMap { $0["id"] })
          return value
        })
      case "computerOpenApp":
        try requireComputerAccess()
        computer.openApp(args["app"] as? String ?? "") { result in self.advancedReply(id, result) }
      case "computerFiles":
        try requireComputerAccess()
        let personal = personalFiles
        computerOperation(id, work: { try personal.inspect(args["operation"] as? String ?? "list", args["path"] as? String ?? "") })
      case "prepareComputerWrite":
        try requireComputerAccess()
        let personal = personalFiles
        computerOperation(id, work: { try personal.workspace.prepare(try personal.relative(args["path"] as? String ?? ""), args["content"] as? String ?? "", args["expected_hash"] as? String) })
      case "applyComputerWrite":
        try requireComputerAccess()
        let personal = personalFiles
        computerOperation(id, work: { try personal.workspace.apply(args["proposal"] as? String ?? "") })
      case "undoComputerWrite":
        try requireComputerAccess()
        let personal = personalFiles
        computerOperation(id, work: { try personal.workspace.undo(args["revision"] as? String ?? "") })
      case "prepareComputerCommand":
        try requireComputerAccess()
        let command = args["command"] as? String ?? ""
        guard !command.isEmpty, command.count <= 5000 else { throw Failure("Invalid command.") }
        let personal = personalFiles
        computerOperation(id, work: { try personal.directory(args["cwd"] as? String ?? "") }, commit: { [self] value in
          let cwd = value as! URL
          let key = UUID().uuidString
          commands[key] = command
          commandDirectories[key] = cwd
          return ["id": key, "command": command, "cwd": cwd.path]
        })
      case "executeComputerCommand":
        try requireComputerAccess()
        executeCommand(id, args)
      case "configureAccess":
        SecurePasswordPrompt.shared.cancel()
        policy.fullComputer = false
        policy.epoch += 1
        policy.grants = Set(args["grants"] as? [String] ?? [])
        policy.apps = Set(args["apps"] as? [String] ?? [])
        policy.origins = Set(args["origins"] as? [String] ?? [])
        computer.elements = [:]
        computer.snapshotID = ""
        reply(id, computer.status())
      case "requestAccessibility":
        let options =
          [kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: true] as CFDictionary
        _ = AXIsProcessTrustedWithOptions(options)
        reply(id, computer.status())
      case "requestScreenRecording":
        _ = CGRequestScreenCaptureAccess()
        reply(id, computer.status())
      case "fillPassword":
        if args["target"] as? String == "browser" { browser.fillPassword(args) { self.advancedReply(id, $0) } }
        else if args["target"] as? String == "computer" { computer.fillPassword(args) { self.advancedReply(id, $0) } }
        else { throw Failure("Choose browser or computer for password entry.") }
      case "computerRead":
        reply(
          id,
          try computer.snapshot(
            args["app"] as? String ?? "", includeMenus: args["include_menus"] as? Bool ?? false))
      case "computerScreenshot":
        computer.capture(args["app"] as? String ?? "") { result in self.advancedReply(id, result) }
      case "computerNavigate": computer.navigate(args) { result in self.advancedReply(id, result) }
      case "computerAction": computer.perform(args) { result in self.advancedReply(id, result) }
      case "browserShow":
        try policy.require("browser")
        guard let u = browser.view?.url, let win = browser.window else {
          throw Failure("Open a browser page first.")
        }
        _ = try policy.checkURL(u.absoluteString)
        win.makeKeyAndOrderFront(nil)
        reply(id, ["status": "shown"])
      case "browserOpen": reply(id, try browser.open(args["url"] as? String ?? ""))
      case "browserScreenshot": browser.capture { result in self.advancedReply(id, result) }
      case "browserPermissionDetails": reply(id, try browser.permissionDetails(args))
      case "browserPermission": reply(id, try browser.permission(args))
      case "browserRead": browser.read { result in self.advancedReply(id, result) }
      case "browserAction": browser.action(args) { result in self.advancedReply(id, result) }
      case "importResource":
        let panel = NSOpenPanel()
        panel.canChooseDirectories = false
        panel.allowsMultipleSelection = false
        panel.message =
          "Import a text reference or reusable skill. It stays in Cipher until you enable it for a model."
        if panel.runModal() == .OK, let u = panel.url {
          guard !u.lastPathComponent.hasPrefix(".env"),
            !["key", "pem"].contains(u.pathExtension.lowercased()),
            (try u.resourceValues(forKeys: [.fileSizeKey])).fileSize ?? 0 < 250000
          else { throw Failure("Choose a non-credential text file smaller than 250 KB.") }
          reply(
            id,
            ["name": u.lastPathComponent, "content": try String(contentsOf: u, encoding: .utf8)])
        } else {
          reply(id)
        }
      case "importImage":
        let panel = NSOpenPanel()
        panel.allowedContentTypes = [.png, .jpeg]
        panel.message =
          "Choose an image for your next model message. It will be sent to the selected model when you send."
        if panel.runModal() == .OK, let u = panel.url {
          let data = try Data(contentsOf: u)
          guard data.count <= 8_000_000 else { throw Failure("Image exceeds 8 MB.") }
          reply(
            id,
            [
              "name": u.lastPathComponent, "data": data.base64EncodedString(),
              "mime": u.pathExtension.lowercased() == "png" ? "image/png" : "image/jpeg",
            ])
        } else {
          reply(id)
        }
      case "gitRead":
        try policy.require("git")
        guard let root = workspace.root else { throw Failure("Open a project first.") }
        try requireGitRoot(root)
        let choices = [
          "status": ["status", "--short", "--branch"],
          "diff": ["diff", "--no-ext-diff", "--no-textconv"],
          "staged": ["diff", "--cached", "--no-ext-diff", "--no-textconv"],
          "log": ["log", "-10", "--oneline"], "branches": ["branch", "--list"],
        ]
        guard let gitArgs = choices[args["view"] as? String ?? "status"] else {
          throw Failure("Unknown Git view.")
        }
        runGit(id, root, gitArgs)
      case "gitChange":
        try policy.require("git")
        guard let root = workspace.root else { throw Failure("Open a project first.") }
        try requireGitRoot(root)
        if args["operation"] as? String == "branch" {
          let branch = args["branch"] as? String ?? ""
          guard
            branch.range(of: "^[A-Za-z0-9][A-Za-z0-9/_-]{0,100}$", options: .regularExpression)
              != nil
          else { throw Failure("Invalid branch name.") }
          runGit(id, root, ["switch", "-c", branch])
        } else if args["operation"] as? String == "commit" {
          let paths = args["files"] as? [String] ?? []
          let message = args["message"] as? String ?? ""
          guard !paths.isEmpty, !message.isEmpty, message.count < 5000 else {
            throw Failure("Choose files and a commit message.")
          }
          var selected: [String] = []
          for path in paths {
            let url = try workspace.resolve(path)
            var directory: ObjCBool = false
            if FileManager.default.fileExists(atPath: url.path, isDirectory: &directory),
              directory.boolValue
            {
              throw Failure("Select individual files, not directories, for a commit.")
            }
            selected.append(String(url.path.dropFirst(root.path.count + 1)))
          }
          runCommit(id, root, selected, message)
        } else {
          throw Failure("Git changes are branch or commit.")
        }
      case "exportChat":
        let panel = NSSavePanel()
        panel.nameFieldStringValue = "Cipher-conversation.md"
        if panel.runModal() == .OK, let u = panel.url {
          try (args["content"] as? String ?? "").write(to: u, atomically: true, encoding: .utf8)
          reply(id, true)
        } else {
          reply(id, false)
        }
      case "cancel":
        cancelWork()
        reply(id, true)
      case "copyText":
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(args["text"] as? String ?? "", forType: .string)
        reply(id, true)
      case "openExternal":
        guard let raw = args["url"] as? String, let url = URL(string: raw),
          ["https", "http"].contains(url.scheme?.lowercased() ?? ""), url.host != nil,
          url.user == nil, url.password == nil
        else { throw Failure("This link is not a valid web URL.") }
        NSWorkspace.shared.open(url)
        reply(id, true)
      case "revealProject":
        if let url = workspace.root { NSWorkspace.shared.open(url) }
        reply(id, true)
      default: throw Failure("Unknown application action.")
      }
    } catch { reply(id, error: error.localizedDescription) }
  }
  func computerOperation(_ id: String, work: @escaping () throws -> Any, commit: ((Any) -> Any)? = nil) {
    let epoch = policy.epoch
    let cancellation = ComputerOperationCancellation()
    computerOperations[id] = cancellation
    computerIOQueue.async {
      guard !cancellation.cancelled else { return }
      let result = Result { try work() }
      DispatchQueue.main.async {
        guard !cancellation.cancelled, self.computerOperations[id] === cancellation else { return }
        self.computerOperations.removeValue(forKey: id)
        guard self.policy.fullComputer, self.policy.epoch == epoch else {
          self.reply(id, error: "Computer operation cancelled.")
          return
        }
        switch result {
        case .success(let value): self.reply(id, commit?(value) ?? value)
        case .failure(let error): self.reply(id, error: error.localizedDescription)
        }
      }
    }
  }
  func requireComputerAccess() throws {
    guard policy.fullComputer else { throw Failure("Turn on Computer access first.") }
  }
  func cancelWork() {
    SecurePasswordPrompt.shared.cancel()
    policy.epoch += 1
    for task in tasks.values { task.cancel() }
    tasks.removeAll()
    for stream in streams.values { stream.cancel() }
    streams.removeAll()
    commands.removeAll()
    commandDirectories.removeAll()
    for (id, cancellation) in computerOperations {
      cancellation.cancel()
      reply(id, error: "Computer operation cancelled.")
    }
    computerOperations.removeAll()
    let personal = personalFiles
    computerIOQueue.async { personal.workspace.proposals.removeAll() }
    workspace.proposals.removeAll()
    computer.elements = [:]
    computer.snapshotID = ""
    browser.snapshotID = ""
    browser.denyPermissions()
    for process in processes.values {
      if kill(-process.processIdentifier, SIGTERM) != 0 { process.terminate() }
    }
  }
  func prepareRendererRecovery() {
    coffee.stop()
    cancelWork()
    policy.fullComputer = false
    browser.close()
    policy.grants = ["files", "edits", "commands", "git"]
    policy.apps = []
    policy.origins = []
    rendererRecoveryPending = true
  }
  func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
    prepareRendererRecovery()
    let base = Bundle.main.resourceURL!.appendingPathComponent("web")
    webView.loadFileURL(base.appendingPathComponent("index.html"), allowingReadAccessTo: base)
  }
  func advancedReply(_ id: String, _ result: Result<Any, Error>) {
    switch result {
    case .success(let value): reply(id, value)
    case .failure(let error): reply(id, error: error.localizedDescription)
    }
  }
  func startStream(_ id: String, _ args: [String: Any]) {
    do {
      guard let raw = args["url"] as? String, let url = URL(string: raw),
        ["http", "https"].contains(url.scheme ?? ""), url.user == nil, url.password == nil,
        url.scheme == "https" || ["localhost", "127.0.0.1", "::1"].contains(url.host ?? "")
      else { throw Failure("Use HTTPS, or HTTP on localhost, for model requests.") }
      var request = URLRequest(url: url)
      request.httpMethod = "POST"
      request.timeoutInterval = 180
      request.setValue("application/json", forHTTPHeaderField: "Content-Type")
      for (k, v) in args["headers"] as? [String: String] ?? [:] {
        request.setValue(v, forHTTPHeaderField: k)
      }
      request.httpBody = try JSONSerialization.data(withJSONObject: args["body"] ?? [:])
      let stream = ModelStream(
        request: request,
        onLine: { line in
          guard let data = try? JSONSerialization.data(withJSONObject: ["id": id, "line": line]),
            let json = String(data: data, encoding: .utf8)
          else { return }
          DispatchQueue.main.async {
            self.web?.evaluateJavaScript("window.receiveStream(\(json))", completionHandler: nil)
          }
        },
        onEnd: { error in
          DispatchQueue.main.async {
            self.streams.removeValue(forKey: id)
            if let error {
              self.reply(id, error: error.localizedDescription)
            } else {
              self.reply(id, true)
            }
          }
        })
      streams[id] = stream
      stream.start()
    } catch { reply(id, error: error.localizedDescription) }
  }
  func gitSync(_ root: URL, _ arguments: [String]) -> (Int32, String) {
    let p = Process()
    let pipe = Pipe()
    p.executableURL = URL(fileURLWithPath: "/usr/bin/git")
    p.arguments =
      [
        "-c", "core.hooksPath=/dev/null", "-c", "core.fsmonitor=false", "-c", "credential.helper=",
        "--no-pager", "--literal-pathspecs",
      ] + arguments
    p.currentDirectoryURL = root
    p.standardOutput = pipe
    p.standardError = pipe
    p.standardInput = FileHandle.nullDevice
    p.environment = [
      "PATH": "/usr/bin:/bin:/usr/sbin:/sbin", "HOME": NSHomeDirectory(),
      "GIT_TERMINAL_PROMPT": "0", "GIT_CONFIG_NOSYSTEM": "1",
    ]
    do {
      try p.run()
      DispatchQueue.global().asyncAfter(deadline: .now() + 20) {
        if p.isRunning {
          p.terminate()
          DispatchQueue.global().asyncAfter(deadline: .now() + 2) {
            if p.isRunning { _ = kill(p.processIdentifier, SIGKILL) }
          }
        }
      }
      var data = Data()
      var truncated = false
      while let chunk = try pipe.fileHandleForReading.read(upToCount: 8192), !chunk.isEmpty {
        if data.count + chunk.count > 100000 { truncated = true }
        data.append(chunk.prefix(max(0, 100000 - data.count)))
      }
      p.waitUntilExit()
      return (
        p.terminationStatus,
        (String(data: data, encoding: .utf8) ?? "[binary output]")
          + (truncated ? "\n[Output truncated at 100 KB]" : "")
      )
    } catch { return (127, error.localizedDescription) }
  }
  func requireGitRoot(_ root: URL) throws {
    let (code, out) = gitSync(root, ["rev-parse", "--show-toplevel"])
    guard code == 0,
      URL(fileURLWithPath: out.trimmingCharacters(in: .whitespacesAndNewlines))
        .resolvingSymlinksInPath().standardizedFileURL.path
        == root.resolvingSymlinksInPath().standardizedFileURL.path
    else {
      throw Failure(
        "Open the Git repository's top-level folder first. Cipher does not inspect a parent repository outside the selected project."
      )
    }
  }
  func runGit(_ id: String, _ root: URL, _ arguments: [String]) {
    DispatchQueue.global().async {
      let (code, output) = self.gitSync(root, arguments)
      self.reply(id, ["exit_code": code, "output": output])
    }
  }
  func runCommit(_ id: String, _ root: URL, _ paths: [String], _ message: String) {
    let epoch = policy.epoch
    DispatchQueue.global().async {
      func authorized() -> Bool {
        DispatchQueue.main.sync {
          self.policy.epoch == epoch && self.policy.grants.contains("git")
            && self.workspace.root?.path == root.path
        }
      }
      guard authorized() else {
        self.reply(id, error: "Git action stopped before execution.")
        return
      }
      let (clean, _) = self.gitSync(root, ["diff", "--cached", "--quiet"])
      guard clean == 0 else {
        self.reply(
          id,
          error:
            "The staging area already has changes. Commit or unstage them before asking Cipher to commit selected files."
        )
        return
      }
      let (_, filterKeys) = self.gitSync(
        root, ["config", "--name-only", "--get-regexp", "^filter\\."])
      guard !filterKeys.contains("[Output truncated") else {
        self.reply(
          id,
          error: "Too many filter settings to inspect automatically. Use your normal Git workflow.")
        return
      }
      var overrides: [String] = []
      for key in filterKeys.split(separator: "\n").map(String.init)
      where ["clean", "smudge", "process", "required"].contains(
        key.split(separator: ".").last?.lowercased() ?? "")
      { overrides += ["-c", key + "=" + (key.lowercased().hasSuffix(".required") ? "false" : "")] }
      guard authorized() else {
        self.reply(id, error: "Git action stopped before staging.")
        return
      }
      let (staged, out) = self.gitSync(root, overrides + ["add", "--"] + paths)
      guard staged == 0 else {
        self.reply(id, error: out)
        return
      }
      let (indexCode, indexFiles) = self.gitSync(root, ["diff", "--cached", "--name-only", "-z"])
      let stagedFiles = Set(indexFiles.split(separator: "\0").map(String.init))
      guard indexCode == 0, !stagedFiles.isEmpty, stagedFiles.isSubset(of: Set(paths)) else {
        self.reply(
          id,
          error:
            "The staging area changed or contains no selected changes. Review it in Git before committing."
        )
        return
      }
      guard authorized() else {
        self.reply(
          id, error: "Stopped before commit. Review the selected files left in the staging area.")
        return
      }
      let (code, output) = self.gitSync(
        root, ["-c", "commit.gpgsign=false", "commit", "-m", message])
      self.reply(
        id,
        [
          "exit_code": code, "output": output,
          "note": "Selected files remain staged if the commit fails.",
        ])
    }
  }
  func network(_ id: String, _ args: [String: Any]) {
    guard let raw = args["url"] as? String, let url = URL(string: raw),
      ["http", "https"].contains(url.scheme?.lowercased() ?? ""), url.user == nil,
      url.password == nil
    else {
      reply(id, error: "Use a valid HTTP or HTTPS API endpoint.")
      return
    }
    if url.scheme == "http", !["localhost", "127.0.0.1", "::1"].contains(url.host ?? "") {
      reply(id, error: "Remote model APIs must use HTTPS. Plain HTTP is allowed only on this Mac.")
      return
    }
    var req = URLRequest(url: url)
    req.httpMethod = args["method"] as? String ?? "POST"
    req.timeoutInterval = 180
    req.setValue("application/json", forHTTPHeaderField: "Content-Type")
    for (key, value) in args["headers"] as? [String: String] ?? [:] {
      req.setValue(value, forHTTPHeaderField: key)
    }
    if let body = args["body"] { req.httpBody = try? JSONSerialization.data(withJSONObject: body) }
    let client = URLSession(configuration: .ephemeral, delegate: NoRedirect(), delegateQueue: nil)
    let task = client.dataTask(with: req) { data, response, error in
      client.finishTasksAndInvalidate()
      DispatchQueue.main.async {
        self.tasks.removeValue(forKey: id)
        if let error {
          self.reply(id, error: error.localizedDescription)
          return
        }
        guard let data, data.count <= 12_000_000 else {
          self.reply(id, error: "Model response is empty or exceeds 12 MB.")
          return
        }
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        let object =
          (try? JSONSerialization.jsonObject(with: data)) ?? [
            "text": String(data: data, encoding: .utf8) ?? ""
          ]
        if !(200..<300).contains(status) {
          self.reply(
            id,
            error:
              "API \(status): \(String(data: data, encoding: .utf8)?.prefix(1200) ?? "Unknown error")"
          )
          return
        }
        if args["includeHeaders"] as? Bool == true {
          self.reply(
            id, ["data": object, "headers": (response as? HTTPURLResponse)?.allHeaderFields ?? [:]])
        } else {
          self.reply(id, object)
        }
      }
    }
    tasks[id] = task
    task.resume()
  }
  func executeCommand(_ id: String, _ args: [String: Any]) {
    guard let key = args["proposal"] as? String, let command = commands.removeValue(forKey: key),
      let root = commandDirectories.removeValue(forKey: key) ?? workspace.root
    else {
      reply(id, error: "Command approval expired.")
      return
    }
    let process = Process()
    let pipe = Pipe()
    process.executableURL = Bundle.main.executableURL
    process.arguments = ["--command-worker", command]
    process.currentDirectoryURL = root
    let env = ProcessInfo.processInfo.environment
    process.environment = Dictionary(
      uniqueKeysWithValues: ["PATH", "HOME", "TMPDIR", "LANG", "SHELL"].compactMap { key in
        env[key].map { (key, $0) }
      })
    process.standardOutput = pipe
    process.standardError = pipe
    process.standardInput = FileHandle.nullDevice
    let output = NSMutableData()
    let lock = NSLock()
    pipe.fileHandleForReading.readabilityHandler = { handle in
      let data = handle.availableData
      lock.lock()
      if output.length < 1_000_000 { output.append(data.prefix(max(0, 1_000_000 - output.length))) }
      lock.unlock()
    }
    process.terminationHandler = { p in
      pipe.fileHandleForReading.readabilityHandler = nil
      let remaining = pipe.fileHandleForReading.readDataToEndOfFile()
      lock.lock()
      if output.length < 1_000_000 {
        output.append(remaining.prefix(max(0, 1_000_000 - output.length)))
      }
      let text = String(data: output as Data, encoding: .utf8) ?? "[Non-UTF8 output]"
      lock.unlock()
      DispatchQueue.main.async {
        self.processes.removeValue(forKey: id)
        self.reply(id, ["exit_code": p.terminationStatus, "output": text, "command": command])
      }
    }
    do {
      try process.run()
      processes[id] = process
      DispatchQueue.main.asyncAfter(deadline: .now() + 60) {
        if process.isRunning {
          if kill(-process.processIdentifier, SIGTERM) != 0 { process.terminate() }
          DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
            if process.isRunning { _ = kill(-process.processIdentifier, SIGKILL) }
          }
        }
      }
    } catch {
      pipe.fileHandleForReading.readabilityHandler = nil
      reply(id, error: error.localizedDescription)
    }
  }
  func webView(
    _ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
    decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
  ) {
    let scheme = navigationAction.request.url?.scheme
    decisionHandler((scheme == "file" || scheme == "about" || scheme == nil) ? .allow : .cancel)
  }
}
final class AppDelegate: NSObject, NSApplicationDelegate {
  var window: NSWindow!
  var workspaceWeb: WKWebView!
  var bridge: Bridge!
  var localStopMonitor: Any?
  var globalStopMonitor: Any?
  @objc func reloadInterface() {
    bridge.prepareRendererRecovery()
    window.contentView = workspaceWeb
    let base = Bundle.main.resourceURL!.appendingPathComponent("web")
    workspaceWeb.loadFileURL(base.appendingPathComponent("index.html"), allowingReadAccessTo: base)
  }
  func applicationDidFinishLaunching(_ notification: Notification) {
    NSWindow.allowsAutomaticWindowTabbing = false
    let storage = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[
      0
    ].appendingPathComponent("Cipher")
    bridge = Bridge(storage: storage)
    let config = WKWebViewConfiguration()
    config.userContentController.add(bridge, name: "cipher")
    let web = WKWebView(frame: .zero, configuration: config)
    workspaceWeb = web
    bridge.web = web
    web.navigationDelegate = bridge
    web.setValue(false, forKey: "drawsBackground")
    window = NSWindow(
      contentRect: NSRect(x: 0, y: 0, width: 1360, height: 900),
      styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false
    )
    window.tabbingMode = .disallowed
    window.title = "Cipher — Your models. Your workspace."
    window.minSize = NSSize(width: 1024, height: 700)
    window.center()
    window.contentView = web
    let base = Bundle.main.resourceURL!.appendingPathComponent("web")
    web.loadFileURL(base.appendingPathComponent("index.html"), allowingReadAccessTo: base)
    let menu = NSMenu()
    let item = NSMenuItem()
    menu.addItem(item)
    let appMenu = NSMenu()
    appMenu.addItem(
      withTitle: "About Cipher", action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)),
      keyEquivalent: "")
    appMenu.addItem(NSMenuItem.separator())
    appMenu.addItem(
      withTitle: "Quit Cipher", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
    item.submenu = appMenu
    let editItem = NSMenuItem()
    menu.addItem(editItem)
    let editMenu = NSMenu(title: "Edit")
    editMenu.addItem(withTitle: "Undo", action: Selector(("undo:")), keyEquivalent: "z")
    editMenu.addItem(withTitle: "Cut", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
    editMenu.addItem(withTitle: "Copy", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
    editMenu.addItem(withTitle: "Paste", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
    editMenu.addItem(
      withTitle: "Select All", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
    editItem.submenu = editMenu
    let viewItem = NSMenuItem()
    menu.addItem(viewItem)
    let viewMenu = NSMenu(title: "View")
    let reloadItem = viewMenu.addItem(withTitle: "Reload Interface and Stop Task", action: #selector(reloadInterface), keyEquivalent: "r")
    reloadItem.target = self
    viewItem.submenu = viewMenu
    NSApp.mainMenu = menu
    func emergency(_ event: NSEvent) -> Bool {
      if event.keyCode == 53 && event.modifierFlags.contains([.command, .shift]) {
        bridge.policy.epoch += 1
        bridge.computer.elements = [:]
        bridge.computer.snapshotID = ""
        for task in bridge.tasks.values { task.cancel() }
        for stream in bridge.streams.values { stream.cancel() }
        for p in bridge.processes.values {
          if kill(-p.processIdentifier, SIGTERM) != 0 { p.terminate() }
        }
        web.evaluateJavaScript(
          "window.cipherEmergencyStop && window.cipherEmergencyStop()", completionHandler: nil)
        return true
      }
      return false
    }
    localStopMonitor = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { event in
      emergency(event) ? nil : event
    }
    globalStopMonitor = NSEvent.addGlobalMonitorForEvents(matching: .keyDown) { event in
      _ = emergency(event)
    }
    window.makeKeyAndOrderFront(nil)
    NSApp.activate(ignoringOtherApps: true)
  }
  func applicationWillTerminate(_ notification: Notification) {
    bridge.coffee.stop()
    bridge.modelLibrary.close()
    for task in bridge.tasks.values { task.cancel() }
    for stream in bridge.streams.values { stream.cancel() }
    for process in bridge.processes.values {
      if kill(-process.processIdentifier, SIGTERM) != 0 { process.terminate() }
    }
  }
  func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }
}
func selfTest() throws {
  let base = FileManager.default.temporaryDirectory.appendingPathComponent(
    "cipher-test-" + UUID().uuidString)
  defer { try? FileManager.default.removeItem(at: base) }
  try FileManager.default.createDirectory(at: base, withIntermediateDirectories: true)
  let ws = Workspace(storage: base.appendingPathComponent("storage"))
  let root = base.appendingPathComponent("project")
  try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
  ws.select(root)
  try "before".write(to: root.appendingPathComponent("a.txt"), atomically: true, encoding: .utf8)
  let p = try ws.prepare("a.txt", "after", digest("before"))
  _ = try ws.apply(p["id"] as! String)
  let saved = try ws.read("a.txt")["content"] as? String
  guard saved == "after" else { throw Failure("Save verification failed") }
  _ = try ws.undo(p["id"] as! String)
  let restored = try ws.read("a.txt")["content"] as? String
  guard restored == "before" else { throw Failure("Undo verification failed") }
  for bad in ["../outside", "/tmp/outside", ".env", ".git/config"] {
    var denied = false
    do { _ = try ws.resolve(bad) } catch { denied = true }
    guard denied else { throw Failure("Expected path rejection: " + bad) }
  }
  try FileManager.default.createSymbolicLink(
    at: root.appendingPathComponent("link"), withDestinationURL: base)
  var escaped = false
  do {
    _ = try ws.resolve("link/outside")
    escaped = true
  } catch {}
  guard !escaped else { throw Failure("Symlink escaped") }
  let stale = try ws.prepare("a.txt", "changed", digest("before"))
  try "external".write(to: root.appendingPathComponent("a.txt"), atomically: true, encoding: .utf8)
  var rejected = false
  do { _ = try ws.apply(stale["id"] as! String) } catch { rejected = true }
  guard rejected else { throw Failure("Stale edit was accepted") }
  let worker = Process()
  let pipe = Pipe()
  worker.executableURL = URL(fileURLWithPath: CommandLine.arguments[0])
  worker.arguments = ["--command-worker", "printf cipher-worker-ok"]
  worker.standardOutput = pipe
  worker.standardError = pipe
  try worker.run()
  worker.waitUntilExit()
  let workerOutput = String(data: pipe.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8)
  guard worker.terminationStatus == 0 && workerOutput == "cipher-worker-ok" else {
    throw Failure("Command worker failed: " + (workerOutput ?? ""))
  }
  let recoveryBridge = Bridge(storage: base.appendingPathComponent("recovery-state"))
  recoveryBridge.commands["pending"] = "echo should-not-run"
  recoveryBridge.workspace.proposals["pending"] = [:]
  recoveryBridge.policy.fullComputer = true
  recoveryBridge.policy.grants.insert("computer")
  recoveryBridge.policy.apps.insert("fixture.editor")
  recoveryBridge.policy.origins.insert("http://localhost:3000")
  let beforeRecovery = recoveryBridge.policy.epoch
  recoveryBridge.prepareRendererRecovery()
  guard !recoveryBridge.policy.fullComputer, recoveryBridge.rendererRecoveryPending, recoveryBridge.commands.isEmpty,
    recoveryBridge.workspace.proposals.isEmpty, recoveryBridge.policy.apps.isEmpty,
    recoveryBridge.policy.origins.isEmpty, !recoveryBridge.policy.grants.contains("computer"),
    recoveryBridge.policy.epoch > beforeRecovery else { throw Failure("Renderer recovery retained pending access or actions") }
  recoveryBridge.policy.fullComputer = true
  let operationStarted = DispatchSemaphore(value: 0)
  let releaseOperation = DispatchSemaphore(value: 0)
  recoveryBridge.computerOperation("blocked-fixture", work: {
    operationStarted.signal()
    releaseOperation.wait()
    return ["status": "fixture"]
  })
  guard operationStarted.wait(timeout: .now() + 2) == .success else { throw Failure("Computer file work did not start off the UI thread") }
  let stopStarted = Date()
  recoveryBridge.cancelWork()
  guard Date().timeIntervalSince(stopStarted) < 0.25, recoveryBridge.computerOperations.isEmpty else { throw Failure("Blocked file IO prevented immediate cancellation") }
  releaseOperation.signal()
  recoveryBridge.computerIOQueue.sync {}
  recoveryBridge.policy.fullComputer = false
  let policy = AccessPolicy()
  policy.fullComputer = true
  _ = try policy.checkURL("https://www.example.com/research")
  _ = try policy.checkURL("http://example.org/")
  policy.fullComputer = false
  var globalWebsiteDenied = false
  do { _ = try policy.checkURL("https://www.example.com/research") } catch { globalWebsiteDenied = true }
  guard globalWebsiteDenied else { throw Failure("Internet access survived revocation") }
  let personalHome = base.appendingPathComponent("personal-home")
  try FileManager.default.createDirectory(at: personalHome.appendingPathComponent("Documents"), withIntermediateDirectories: true)
  try FileManager.default.createDirectory(at: personalHome.appendingPathComponent("Library"), withIntermediateDirectories: true)
  let personal = PersonalFiles(storage: base.appendingPathComponent("personal-state"), home: personalHome)
  let report = try personal.workspace.prepare("Documents/report.txt", "verified report", nil)
  _ = try personal.workspace.apply(report["id"] as! String)
  guard try personal.inspect("read", "Documents/report.txt")["content"] as? String == "verified report" else { throw Failure("Computer report save failed") }
  for forbidden in ["../outside", "/etc/passwd", "Library/credentials", ".ssh/id_rsa", "Documents/.env"] {
    var denied = false
    do { _ = try personal.inspect("read", forbidden) } catch { denied = true }
    guard denied else { throw Failure("Computer files accepted a protected path") }
  }
  var fullGrantDenied = false
  do { try recoveryBridge.requireComputerAccess() } catch { fullGrantDenied = true }
  guard fullGrantDenied else { throw Failure("Computer access defaulted on") }
  var deniedComputer = false
  do { try policy.require("computer") } catch { deniedComputer = true }
  guard deniedComputer else { throw Failure("Computer access was not denied by default") }
  policy.origins = ["https://example.com", "http://localhost:3000"]
  _ = try policy.checkURL("https://example.com:443/docs")
  _ = try policy.checkURL("http://localhost:3000/test")
  for raw in [
    "https://evil.example/", "http://example.com/", "file:///etc/passwd",
    "https://user:secret@example.com/",
  ] {
    var denied = false
    do { _ = try policy.checkURL(raw) } catch { denied = true }
    guard denied else { throw Failure("URL policy accepted: " + raw) }
  }
  var snapshotBudget = SnapshotBudget()
  for i in 0..<500 {
    _ = snapshotBudget.append(["id": String(i), "value": String(repeating: "🌱", count: 100)])
  }
  guard snapshotBudget.bytes <= 16000, snapshotBudget.truncated, !snapshotBudget.rows.isEmpty else {
    throw Failure("Snapshot budget failed")
  }
  let computer = ComputerController(policy)
  var blocked = false
  do { _ = try computer.target("com.apple.TextEdit") } catch { blocked = true }
  guard blocked else { throw Failure("Unapproved app was accepted") }
  try FileManager.default.removeItem(at: root.appendingPathComponent("link"))
  let bridge = Bridge(storage: base.appendingPathComponent("git-storage"))
  guard bridge.gitSync(root, ["init", "-q"]).0 == 0 else {
    throw Failure("Git fixture init failed")
  }
  _ = bridge.gitSync(root, ["config", "user.name", "Cipher Test"])
  _ = bridge.gitSync(root, ["config", "user.email", "cipher-test@example.invalid"])
  _ = bridge.gitSync(root, ["add", "--", "a.txt"])
  guard bridge.gitSync(root, ["-c", "commit.gpgsign=false", "commit", "-qm", "fixture"]).0 == 0
  else { throw Failure("Git fixture commit failed") }
  guard bridge.gitSync(root, ["switch", "-c", "cipher/test"]).0 == 0 else {
    throw Failure("Git branch test failed")
  }
  guard bridge.gitSync(root, ["status", "--short"]).1.isEmpty else {
    throw Failure("Git fixture was unexpectedly dirty")
  }
  try bridge.requireGitRoot(root)
  let nested = root.appendingPathComponent("nested")
  try FileManager.default.createDirectory(at: nested, withIntermediateDirectories: true)
  var parentDenied = false
  do { try bridge.requireGitRoot(nested) } catch { parentDenied = true }
  guard parentDenied else { throw Failure("A parent Git repository escaped the project scope") }
  print(
    "PASS: edits/checkpoints, boundary and stale-write rejection, command worker, default-denied computer scope, website origins, local Git commit and branch"
  )
}
if CommandLine.arguments.count >= 3 && CommandLine.arguments[1] == "--command-worker" {
  guard setpgid(0, 0) == 0 || getpgrp() == getpid() else {
    perror("setpgid")
    exit(126)
  }
  let strings = ["/bin/zsh", "-c", CommandLine.arguments[2]]
  var args = strings.map { strdup($0) }
  args.append(nil)
  args.withUnsafeMutableBufferPointer { pointer in _ = execv("/bin/zsh", pointer.baseAddress!) }
  perror("execv")
  exit(127)
} else if CommandLine.arguments.count == 3 && CommandLine.arguments[1] == "--stream-probe" {
  guard let u = URL(string: CommandLine.arguments[2]),
    ["localhost", "127.0.0.1"].contains(u.host ?? "")
  else { exit(2) }
  let group = DispatchGroup()
  let lock = NSLock()
  group.enter()
  var lines: [String] = []
  var failure: String?
  var req = URLRequest(url: u)
  req.httpMethod = "POST"
  req.httpBody = Data("{}".utf8)
  let stream = ModelStream(
    request: req,
    onLine: { line in
      lock.lock()
      lines.append(line)
      lock.unlock()
    },
    onEnd: { error in
      failure = error?.localizedDescription
      group.leave()
    })
  stream.start()
  guard group.wait(timeout: .now() + 15) == .success else {
    stream.cancel()
    fputs("Stream probe timed out\n", stderr)
    exit(1)
  }
  if let failure {
    fputs(failure + "\n", stderr)
    exit(1)
  }
  let data = try! JSONSerialization.data(withJSONObject: lines)
  print(String(data: data, encoding: .utf8)!)
} else if CommandLine.arguments.contains("--coffee-self-test") {
  do {
    let coffee = CoffeeAwake()
    assert(!coffee.enabled)
    _ = try coffee.setEnabled(true)
    assert(coffee.enabled)
    _ = try coffee.setEnabled(true)
    print("Coffee assertions active for inspection")
    Thread.sleep(forTimeInterval: 3)
    _ = try coffee.setEnabled(false)
    assert(!coffee.enabled)
    print("PASS: native coffee assertions enable, remain idempotent and release")
  } catch { fputs("FAIL: \(error)\n", stderr); exit(1) }
} else if CommandLine.arguments.contains("--self-test") {
  do { try selfTest() } catch {
    fputs("FAIL: \(error)\n", stderr)
    exit(1)
  }
} else {
  let app = NSApplication.shared
  let delegate = AppDelegate()
  app.delegate = delegate
  app.setActivationPolicy(.regular)
  app.run()
}
