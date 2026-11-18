import Foundation

final class NoRedirect: NSObject, URLSessionTaskDelegate {
  func urlSession(
    _ session: URLSession, task: URLSessionTask,
    willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest,
    completionHandler: @escaping (URLRequest?) -> Void
  ) { completionHandler(nil) }
}

final class ModelStream: NSObject, URLSessionDataDelegate {
  var session: URLSession!
  var task: URLSessionDataTask!
  var buffer = Data(), responseData = Data(), total = 0, status = 0
  var failed: Error?
  let onLine: (String) -> Void
  let onEnd: (Error?) -> Void
  init(request: URLRequest, onLine: @escaping (String) -> Void, onEnd: @escaping (Error?) -> Void) {
    self.onLine = onLine
    self.onEnd = onEnd
    super.init()
    let config = URLSessionConfiguration.ephemeral
    config.timeoutIntervalForRequest = 180
    config.timeoutIntervalForResource = 600
    session = URLSession(configuration: config, delegate: self, delegateQueue: nil)
    task = session.dataTask(with: request)
  }
  func start() { task.resume() }
  func cancel() { task.cancel() }
  func urlSession(
    _ session: URLSession, task: URLSessionTask,
    willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest,
    completionHandler: @escaping (URLRequest?) -> Void
  ) { completionHandler(nil) }
  func urlSession(
    _ session: URLSession, dataTask: URLSessionDataTask, didReceive response: URLResponse,
    completionHandler: @escaping (URLSession.ResponseDisposition) -> Void
  ) {
    status = (response as? HTTPURLResponse)?.statusCode ?? 0
    completionHandler(.allow)
  }
  func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
    total += data.count
    guard total <= 12_000_000 else {
      failed = Failure("Model stream exceeded 12 MB.")
      task.cancel()
      return
    }
    if !(200..<300).contains(status) {
      responseData.append(data.prefix(max(0, 1200 - responseData.count)))
      return
    }
    buffer.append(data)
    while let newline = buffer.firstIndex(of: 10) {
      let line = buffer.prefix(upTo: newline)
      buffer.removeSubrange(...newline)
      if let text = String(data: line, encoding: .utf8) {
        onLine(text.trimmingCharacters(in: .newlines))
      }
    }
  }
  func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
    if !buffer.isEmpty, let text = String(data: buffer, encoding: .utf8) { onLine(text) }
    let result =
      failed ?? error
      ?? ((200..<300).contains(status)
        ? nil
        : Failure(
          "API \(status): " + (String(data: responseData, encoding: .utf8) ?? "Request failed")))
    onEnd(result)
    session.finishTasksAndInvalidate()
  }
}
