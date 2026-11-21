import AppKit
import ApplicationServices
import CryptoKit
import ScreenCaptureKit
import WebKit

// Native session capabilities are reset on restart. Models cannot grant themselves access.
final class SecurePasswordPrompt {
  static let shared = SecurePasswordPrompt()
  private var active: NSAlert?
  func cancel() { if let active { active.window.sheetParent?.endSheet(active.window, returnCode: .abort) } }
  func request(_ target: String, completion: @escaping (String?) -> Void) {
    guard active == nil,
      let host = NSApp.windows.first(where: { $0.title.hasPrefix("CyMalika —") }) else { completion(nil); return }
    let alert = NSAlert()
    alert.messageText = "Allow password entry?"
    alert.informativeText = String(target.prefix(1000)) + "\n\nThe password goes directly to this field. It is not sent to the AI, saved in chat or placed on the clipboard. CyMalika will not press Sign in; the website/app can react to input."
    alert.addButton(withTitle: "Approve & fill password")
    alert.addButton(withTitle: "Cancel")
    let field = NSSecureTextField(frame: NSRect(x: 0, y: 0, width: 420, height: 28))
    field.placeholderString = "Password (session only)"
    alert.accessoryView = field
    alert.window.initialFirstResponder = field
    active = alert
    host.makeKeyAndOrderFront(nil)
    alert.beginSheetModal(for: host) { response in
      let value = field.stringValue
      field.stringValue = ""
      self.active = nil
      completion(response == .alertFirstButtonReturn && !value.isEmpty && value.count <= 4096 ? value : nil)
    }
  }
}

final class AccessPolicy {
  var grants: Set<String> = ["files", "edits", "commands", "git"]
  var apps: Set<String> = []
  var origins: Set<String> = []
  var fullComputer = false
  var epoch = 0
  func require(_ capability: String) throws {
    guard grants.contains(capability) else {
      throw Failure("Enable \(capability) in Access before using this tool.")
    }
  }
  func checkURL(_ raw: String) throws -> URL {
    guard let u = URL(string: raw), ["http", "https"].contains(u.scheme ?? ""), u.user == nil,
      u.password == nil, let host = u.host
    else { throw Failure("Use an HTTP or HTTPS URL without embedded credentials.") }
    guard fullComputer || u.scheme == "https" || ["localhost", "127.0.0.1", "::1"].contains(host) else {
      throw Failure("HTTP is allowed only on this Mac.")
    }
    let origin =
      "\(u.scheme!)://\(host)\(u.port.flatMap { (u.scheme == "https" && $0 == 443 || u.scheme == "http" && $0 == 80) ? nil : ":\($0)" } ?? "")"
    guard fullComputer || origins.contains(origin) else {
      throw Failure("Allow this website origin in Access first: " + origin)
    }
    return u
  }
}
struct SnapshotBudget {
  var rows: [[String: Any]] = []
  var bytes = 2
  var truncated = false
  mutating func append(_ row: [String: Any]) -> Bool {
    let size = ((try? JSONSerialization.data(withJSONObject: row).count) ?? 16001) + 1
    guard rows.count < 120, bytes + size <= 16000 else {
      truncated = true
      return false
    }
    rows.append(row)
    bytes += size
    return true
  }
}
final class ComputerController {
  let policy: AccessPolicy
  var elements: [String: AXUIElement] = [:]
  var snapshotID = ""
  var lastApp = ""
  var availableAppIDs: Set<String> = []
  var secrets: Set<String> = []
  init(_ policy: AccessPolicy) { self.policy = policy }
  func status() -> [String: Any] {
    [
      "accessibility": AXIsProcessTrusted(), "screenRecording": CGPreflightScreenCaptureAccess(),
      "apps": Array(policy.apps).sorted(),
    ]
  }
  func runningApps() -> [[String: String]] {
    NSWorkspace.shared.runningApplications.filter {
      $0.activationPolicy == .regular && $0.bundleIdentifier != Bundle.main.bundleIdentifier
    }.compactMap { app in
      guard let id = app.bundleIdentifier else { return nil }
      return ["id": id, "name": app.localizedName ?? id]
    }.sorted { $0["name"]! < $1["name"]! }
  }
  func target(_ id: String) throws -> NSRunningApplication {
    try policy.require("computer")
    guard !["com.apple.SecurityAgent", "com.apple.authorizationhost", "com.apple.loginwindow", "com.apple.LocalAuthentication.UIAgent"].contains(id) else { throw Failure("Protected system authentication requires direct input.") }
    guard id != Bundle.main.bundleIdentifier else {
      throw Failure("CyMalika cannot control its own approval window.")
    }
    guard policy.fullComputer || policy.apps.contains(id) else { throw Failure("This app is not allowed in Access.") }
    guard let app = NSRunningApplication.runningApplications(withBundleIdentifier: id).first else {
      throw Failure("The selected app is not running.")
    }
    return app
  }
  func installedApps() -> [[String: String]] {
    var result: [String: [String: String]] = [:]
    for folder in ["/Applications", "/Applications/Utilities", "/System/Applications", "/System/Applications/Utilities", NSHomeDirectory() + "/Applications"] {
      for url in (try? FileManager.default.contentsOfDirectory(at: URL(fileURLWithPath: folder), includingPropertiesForKeys: nil)) ?? [] where url.pathExtension == "app" {
        guard let bundle = Bundle(url: url), let id = bundle.bundleIdentifier, id != Bundle.main.bundleIdentifier else { continue }
        result[id] = ["id": id, "name": bundle.object(forInfoDictionaryKey: "CFBundleDisplayName") as? String ?? url.deletingPathExtension().lastPathComponent]
      }
    }
    return Array(result.values).sorted { $0["name"]! < $1["name"]! }
  }
  func openApp(_ id: String, completion: @escaping (Result<Any, Error>) -> Void) {
    do {
      guard policy.fullComputer else { throw Failure("Turn on Computer access first.") }
      guard availableAppIDs.contains(id), let url = NSWorkspace.shared.urlForApplication(withBundleIdentifier: id) else { throw Failure("Choose an installed app ID from computer_apps.") }
      let epoch = policy.epoch
      NSWorkspace.shared.openApplication(at: url, configuration: NSWorkspace.OpenConfiguration()) { app, error in
        DispatchQueue.main.async {
          guard self.policy.fullComputer, self.policy.epoch == epoch else { completion(.failure(Failure("App launch cancelled."))); return }
          if let error { completion(.failure(error)); return }
          completion(.success(["app": id, "status": "opened", "next": "Call computer_read to inspect the app before acting."]))
        }
      }
    } catch { completion(.failure(error)) }
  }
  func attribute(_ e: AXUIElement, _ key: String) -> CFTypeRef? {
    var value: CFTypeRef?
    guard AXUIElementCopyAttributeValue(e, key as CFString, &value) == .success else { return nil }
    return value
  }
  func secure(_ e: AXUIElement) -> Bool {
    (attribute(e, kAXSubroleAttribute) as? String) == kAXSecureTextFieldSubrole
  }
  func snapshot(_ id: String, includeMenus: Bool = false) throws -> [String: Any] {
    let app = try target(id)
    guard AXIsProcessTrusted() else {
      throw Failure("Enable CyMalika in macOS Accessibility settings using Access → Accessibility.")
    }
    let root = AXUIElementCreateApplication(app.processIdentifier)
    elements = [:]
    snapshotID = UUID().uuidString
    lastApp = id
    var budget = SnapshotBudget()
    var visited = 0
    func visit(_ e: AXUIElement, _ depth: Int) {
      guard visited < 350, depth < 14 else { return }
      visited += 1
      if secure(e) {
        let key = String(budget.rows.count)
        if budget.append(["id": key, "role": "secure field", "label": "Password", "value": "[redacted]", "secure": true]) { elements[key] = e }
        return
      }
      let role = attribute(e, kAXRoleAttribute) as? String ?? "element"
      if ["AXRuler", "AXRulerMarker"].contains(role) || (!includeMenus && role == "AXMenuBar") {
        return
      }
      let label =
        attribute(e, kAXTitleAttribute) as? String ?? attribute(e, kAXDescriptionAttribute)
        as? String ?? ""
      let rawValue = attribute(e, kAXValueAttribute)
      let value = rawValue as? String ?? (rawValue as? NSNumber)?.stringValue ?? ""
      var actionNames: CFArray?
      AXUIElementCopyActionNames(e, &actionNames)
      let actions = actionNames as? [String] ?? []
      var settable: DarwinBoolean = false
      AXUIElementIsAttributeSettable(e, kAXValueAttribute as CFString, &settable)
      if !label.isEmpty || !value.isEmpty || !actions.isEmpty || settable.boolValue {
        let key = String(budget.rows.count)
        if budget.append([
          "id": key, "role": role, "label": redact(String(label.prefix(220))),
          "value": redact(String(value.prefix(1200))), "actions": actions, "editable": settable.boolValue,
          "depth": depth,
        ]) {
          elements[key] = e
        }
      }
      if let children = attribute(e, kAXChildrenAttribute) as? [AXUIElement] {
        for child in children { visit(child, depth + 1) }
      }
    }
    visit(root, 0)
    return [
      "app": id, "snapshot": snapshotID, "elements": budget.rows, "menus_omitted": !includeMenus,
      "truncated": visited >= 350 || budget.truncated,
    ]
  }
  func redact(_ value: String) -> String {
    secrets.reduce(value) { text, secret in text.replacingOccurrences(of: secret, with: "[redacted]") }
  }
  func fieldContext(_ element: AXUIElement) -> String {
    var current = element
    var values: [String] = []
    for _ in 0..<20 {
      if let url = attribute(current, kAXURLAttribute) as? URL { values.append(url.absoluteString) }
      if attribute(current, kAXRoleAttribute) as? String == kAXWindowRole,
        let title = attribute(current, kAXTitleAttribute) as? String { values.append(title) }
      guard let parent = attribute(current, kAXParentAttribute), CFGetTypeID(parent) == AXUIElementGetTypeID() else { break }
      current = unsafeBitCast(parent, to: AXUIElement.self)
    }
    return values.joined(separator: "\n")
  }
  func fillPassword(_ args: [String: Any], completion: @escaping (Result<Any, Error>) -> Void) {
    do {
      let id = args["app"] as? String ?? ""
      let app = try target(id)
      guard AXIsProcessTrusted(), let token = args["snapshot"] as? String, token == snapshotID,
        lastApp == id, let key = args["element"] as? String, let element = elements[key], secure(element)
        else { throw Failure("Choose a password field from a fresh app snapshot.") }
      let context = fieldContext(element)
      let epoch = policy.epoch
      SecurePasswordPrompt.shared.request("App: " + (app.localizedName ?? id) + "\nTarget: " + context + "\nField: Password") { secret in
        guard let secret else { completion(.success(["status": "rejected"])); return }
        guard self.policy.epoch == epoch, self.snapshotID == token, self.lastApp == id,
          (try? self.target(id)) != nil, self.secure(element), self.fieldContext(element) == context else {
          completion(.failure(Failure("Password target changed or access was revoked. Inspect the field again."))); return
        }
        self.snapshotID = ""
        self.elements.removeAll()
        self.secrets.insert(secret)
        let result = AXUIElementSetAttributeValue(element, kAXValueAttribute as CFString, secret as CFString)
        guard result == .success else { completion(.failure(Failure("This app rejected secure field entry. Use direct input for this field."))); return }
        completion(.success(["status": "filled", "submitted": false]))
      }
    } catch { completion(.failure(error)) }
  }
  func window(_ app: NSRunningApplication) throws -> (CGWindowID, CGRect) {
    let windows =
      CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID)
      as? [[String: Any]] ?? []
    for w in windows
    where (w[kCGWindowOwnerPID as String] as? NSNumber)?.int32Value == app.processIdentifier
      && (w[kCGWindowLayer as String] as? Int) == 0
    {
      if let n = w[kCGWindowNumber as String] as? NSNumber,
        let b = w[kCGWindowBounds as String] as? [String: Any],
        let rect = CGRect(dictionaryRepresentation: b as CFDictionary), rect.width > 50,
        rect.height > 50
      {
        return (n.uint32Value, rect)
      }
    }
    throw Failure("No visible window found for that app.")
  }
  func screenshotLegacy(_ id: String) throws -> [String: Any] {
    let app = try target(id)
    guard CGPreflightScreenCaptureAccess() else {
      throw Failure("Enable Screen Recording for CyMalika in macOS Settings first.")
    }
    let (number, rect) = try window(app)
    guard
      let image = CGWindowListCreateImage(
        .null, .optionIncludingWindow, number, [.boundsIgnoreFraming, .bestResolution])
    else { throw Failure("macOS could not capture this window.") }
    let rep = NSBitmapImageRep(cgImage: image)
    guard let data = rep.representation(using: .jpeg, properties: [.compressionFactor: 0.65]),
      data.count < 8_000_000
    else { throw Failure("Window image exceeds the image limit.") }
    return [
      "data": data.base64EncodedString(), "mime": "image/jpeg", "width": image.width,
      "height": image.height,
      "bounds": ["x": rect.minX, "y": rect.minY, "width": rect.width, "height": rect.height],
      "app": id,
    ]
  }
  func capture(_ id: String, completion: @escaping (Result<Any, Error>) -> Void) {
    do {
      guard secrets.isEmpty else { throw Failure("Use redacted text observations after password entry; restart CyMalika before requesting images.") }
      let app = try target(id)
      guard CGPreflightScreenCaptureAccess() else {
        throw Failure("Enable Screen Recording for CyMalika in macOS Settings first.")
      }
      if #available(macOS 14.0, *) {
        let (number, bounds) = try window(app)
        let epoch = policy.epoch
        SCShareableContent.getExcludingDesktopWindows(true, onScreenWindowsOnly: true) {
          content, error in
          DispatchQueue.main.async {
            if let error {
              completion(.failure(error))
              return
            }
            guard self.policy.epoch == epoch, (try? self.target(id)) != nil else {
              completion(.failure(Failure("Capture was cancelled or access changed.")))
              return
            }
            guard let window = content?.windows.first(where: { $0.windowID == number }) else {
              completion(.failure(Failure("The app window changed. Inspect it again.")))
              return
            }
            let filter = SCContentFilter(desktopIndependentWindow: window)
            let config = SCStreamConfiguration()
            config.width = max(1, min(1600, Int(bounds.width * 2)))
            config.height = max(1, Int(Double(config.width) * bounds.height / bounds.width))
            config.showsCursor = false
            config.capturesAudio = false
            SCScreenshotManager.captureImage(contentFilter: filter, configuration: config) {
              image, error in
              DispatchQueue.main.async {
                if let error {
                  completion(.failure(error))
                  return
                }
                guard self.policy.epoch == epoch, (try? self.target(id)) != nil else {
                  completion(.failure(Failure("Capture was cancelled or access changed.")))
                  return
                }
                guard let image,
                  let data = NSBitmapImageRep(cgImage: image).representation(
                    using: .jpeg, properties: [.compressionFactor: 0.65]), data.count < 8_000_000
                else {
                  completion(.failure(Failure("Could not encode the app window screenshot.")))
                  return
                }
                completion(
                  .success([
                    "data": data.base64EncodedString(), "mime": "image/jpeg", "app": id,
                    "width": image.width, "height": image.height,
                    "bounds": [
                      "x": bounds.minX, "y": bounds.minY, "width": bounds.width,
                      "height": bounds.height,
                    ],
                  ]))
              }
            }
          }
        }
      } else {
        completion(.success(try screenshotLegacy(id)))
      }
    } catch { completion(.failure(error)) }
  }
  func navigate(_ args: [String: Any], completion: @escaping (Result<Any, Error>) -> Void) {
    do {
      guard policy.fullComputer else { throw Failure("Turn on Computer access first.") }
      let app = try target(args["app"] as? String ?? "")
      let name = (app.localizedName ?? "").lowercased()
      guard name.range(of: "chrome|chromium|safari|firefox|edge|brave|opera|vivaldi", options: .regularExpression) != nil,
        let applicationURL = app.bundleURL else { throw Failure("Choose a running browser from computer_apps.") }
      let url = try policy.checkURL(args["url"] as? String ?? "")
      let epoch = policy.epoch
      let configuration = NSWorkspace.OpenConfiguration()
      configuration.activates = true
      NSWorkspace.shared.open([url], withApplicationAt: applicationURL, configuration: configuration) { _, error in
        DispatchQueue.main.async {
          guard self.policy.fullComputer, self.policy.epoch == epoch else {
            completion(.failure(Failure("Browser navigation cancelled."))); return
          }
          if let error { completion(.failure(error)); return }
          completion(.success(["status": "navigation_requested", "app": args["app"] as? String ?? "", "url": url.absoluteString,
            "next": "Call computer_read to verify the loaded URL and page content. Opening a URL does not prove the page loaded."]))
        }
      }
    } catch { completion(.failure(error)) }
  }
  func focus(_ app: NSRunningApplication) {
    app.unhide()
    if #available(macOS 14.0, *) {
      NSApplication.shared.yieldActivation(to: app)
      _ = app.activate(from: NSRunningApplication.current, options: [.activateAllWindows])
    } else {
      _ = app.activate(options: [.activateAllWindows, .activateIgnoringOtherApps])
    }
    let root = AXUIElementCreateApplication(app.processIdentifier)
    _ = AXUIElementSetAttributeValue(root, kAXFrontmostAttribute as CFString, kCFBooleanTrue)
    if let window = attribute(root, kAXFocusedWindowAttribute) {
      let element = window as! AXUIElement
      _ = AXUIElementPerformAction(element, kAXRaiseAction as CFString)
    }
  }
  func perform(_ args: [String: Any], completion: @escaping (Result<Any, Error>) -> Void) {
    do {
      let app = try target(args["app"] as? String ?? "")
      let operation = args["operation"] as? String ?? ""
      guard ["click", "key", "scroll", "type"].contains(operation) else {
        completion(.success(try action(args)))
        return
      }
      guard args["snapshot"] as? String == snapshotID, !snapshotID.isEmpty,
        lastApp == args["app"] as? String
      else { throw Failure("Read a fresh accessibility snapshot first.") }
      let epoch = policy.epoch
      focus(app)
      func attempt(_ remaining: Int) {
        guard self.policy.epoch == epoch else {
          completion(.failure(Failure("Action cancelled.")))
          return
        }
        if NSWorkspace.shared.frontmostApplication?.processIdentifier == app.processIdentifier {
          do { completion(.success(try self.action(args))) } catch { completion(.failure(error)) }
          return
        }
        guard remaining > 0 else {
          completion(
            .failure(Failure("Could not bring the allowed app forward. No input was sent.")))
          return
        }
        if remaining == 4 || remaining == 2 { self.focus(app) }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) { attempt(remaining - 1) }
      }
      DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) { attempt(6) }
    } catch { completion(.failure(error)) }
  }
  func action(_ args: [String: Any]) throws -> [String: Any] {
    let id = args["app"] as? String ?? ""
    let app = try target(id)
    let op = args["operation"] as? String ?? ""
    guard AXIsProcessTrusted() else { throw Failure("macOS Accessibility permission is required.") }
    if op == "activate" {
      focus(app)
      return ["status": "activation_requested", "app": id, "next": "Read the app and verify its state before sending input."]
    }
    guard args["snapshot"] as? String == snapshotID, !snapshotID.isEmpty, lastApp == id else {
      throw Failure("Read a fresh accessibility snapshot before each action.")
    }
    guard
      ["press", "set_text"].contains(op)
        || NSWorkspace.shared.frontmostApplication?.processIdentifier == app.processIdentifier
    else {
      throw Failure(
        "Activate the allowed app, inspect it, and retry. CyMalika will not type into another app.")
    }
    if ["press", "set_text"].contains(op) {
      guard args["snapshot"] as? String == snapshotID, lastApp == id,
        let key = args["element"] as? String, let e = elements[key], !secure(e)
      else { throw Failure("Take a fresh snapshot and choose a non-secure element.") }
      let result: AXError
      if op == "press" {
        result = AXUIElementPerformAction(e, kAXPressAction as CFString)
      } else {
        let text = args["text"] as? String ?? ""
        guard text.count <= 10000 else { throw Failure("Text exceeds the 10,000-character limit.") }
        result = AXUIElementSetAttributeValue(e, kAXValueAttribute as CFString, text as CFString)
      }
      guard result == .success else {
        throw Failure("The app rejected this accessibility action (\(result.rawValue)).")
      }
    } else if op == "type" {
      let root = AXUIElementCreateApplication(app.processIdentifier)
      guard let focusedValue = attribute(root, kAXFocusedUIElementAttribute),
        CFGetTypeID(focusedValue) == AXUIElementGetTypeID()
      else {
        throw Failure("Cannot inspect the focused field. Use a visible editable field instead.")
      }
      let focused = unsafeBitCast(focusedValue, to: AXUIElement.self)
      guard !secure(focused) else { throw Failure("Use password_fill for secure entry without sending the password to the AI.") }
      let text = args["text"] as? String ?? ""
      guard text.count <= 2000 else {
        throw Failure("Typing is limited to 2,000 characters per approved action.")
      }
      let units = Array(text.utf16)
      for start in stride(from: 0, to: units.count, by: 64) {
        let chunk = Array(units[start..<min(start + 64, units.count)])
        for down in [true, false] {
          let event = CGEvent(keyboardEventSource: nil, virtualKey: 0, keyDown: down)
          chunk.withUnsafeBufferPointer { buffer in
            event?.keyboardSetUnicodeString(
              stringLength: buffer.count, unicodeString: buffer.baseAddress)
          }
          event?.post(tap: .cghidEventTap)
        }
      }
    } else if op == "click" {
      let (_, rect) = try window(app)
      let point = CGPoint(x: args["x"] as? Double ?? -1, y: args["y"] as? Double ?? -1)
      guard rect.contains(point) else {
        throw Failure("Click coordinates must be inside the allowed app's window.")
      }
      for type in [CGEventType.leftMouseDown, .leftMouseUp] {
        CGEvent(
          mouseEventSource: nil, mouseType: type, mouseCursorPosition: point, mouseButton: .left)?
          .post(tap: .cghidEventTap)
      }
    } else if op == "key" {
      let keys: [String: CGKeyCode] = [
        "return": 36, "tab": 48, "escape": 53, "backspace": 51, "left": 123, "right": 124,
        "down": 125, "up": 126, "a": 0, "c": 8, "v": 9, "s": 1, "z": 6, "l": 37, "w": 13, "t": 17,
      ]
      guard let code = keys[(args["key"] as? String ?? "").lowercased()] else {
        throw Failure(
          "Unsupported key. Use return, tab, escape, backspace, arrows, or a/c/v/s/z/l/w/t with modifiers."
        )
      }
      let mods = args["modifiers"] as? [String] ?? []
      var flags: CGEventFlags = []
      if mods.contains("command") { flags.insert(.maskCommand) }
      if mods.contains("shift") { flags.insert(.maskShift) }
      if mods.contains("option") { flags.insert(.maskAlternate) }
      if mods.contains("control") { flags.insert(.maskControl) }
      for down in [true, false] {
        let event = CGEvent(keyboardEventSource: nil, virtualKey: code, keyDown: down)
        event?.flags = flags
        event?.post(tap: .cghidEventTap)
      }
    } else if op == "scroll" {
      let (_, rect) = try window(app)
      let position = CGEvent(source: nil)?.location ?? .zero
      guard rect.contains(position) else {
        throw Failure("Place the pointer inside the allowed app before scrolling.")
      }
      let amount = min(800, max(-800, args["amount"] as? Int ?? 0))
      CGEvent(
        scrollWheelEvent2Source: nil, units: .pixel, wheelCount: 1, wheel1: Int32(amount),
        wheel2: 0, wheel3: 0)?.post(tap: .cghidEventTap)
    } else {
      throw Failure("Unsupported computer operation.")
    }
    elements = [:]
    snapshotID = ""
    return [
      "status": "performed", "app": id, "operation": op,
      "next": "Inspect a fresh snapshot before the next action.",
    ]
  }
}
final class BrowserController: NSObject, WKNavigationDelegate, WKUIDelegate, NSToolbarDelegate {
  let policy: AccessPolicy
  var window: NSWindow?
  var view: WKWebView?
  var elements: [String: String] = [:]
  var snapshotID = ""
  var secrets: Set<String> = []
  struct PermissionRequest { let origin: String; let kind: String; let decide: (WKPermissionDecision) -> Void }
  var pendingPermissions: [String: PermissionRequest] = [:]
  init(_ policy: AccessPolicy) { self.policy = policy }
  func close() {
    denyPermissions()
    snapshotID = ""
    elements.removeAll()
    secrets.removeAll()
    view?.stopLoading()
    view?.removeFromSuperview()
    window?.close()
    view = nil
    window = nil
  }
  func open(_ raw: String) throws -> [String: Any] {
    try policy.require("browser")
    let u = try policy.checkURL(raw)
    if view == nil {
      let config = WKWebViewConfiguration()
      config.websiteDataStore = .nonPersistent()
      let w = WKWebView(frame: .zero, configuration: config)
      w.navigationDelegate = self
      w.uiDelegate = self
      view = w
      let win = NSWindow(
        contentRect: NSRect(x: 100, y: 100, width: 1100, height: 760),
        styleMask: [.titled, .closable, .resizable, .miniaturizable], backing: .buffered,
        defer: false)
      win.tabbingMode = .disallowed
      win.title = "CyMalika Browser"
      win.contentView = w
      win.isReleasedWhenClosed = false
      let toolbar = NSToolbar(identifier: "CyMalikaBrowserToolbar")
      toolbar.delegate = self
      toolbar.displayMode = .iconAndLabel
      win.toolbar = toolbar
      window = win
    }
    snapshotID = ""
    window?.makeKeyAndOrderFront(nil)
    view?.load(URLRequest(url: u))
    return [
      "status": "loading", "url": u.absoluteString,
      "next": "Use browser_read after the page loads.",
    ]
  }
  func denyPermissions() {
    let requests = Array(pendingPermissions.values)
    pendingPermissions.removeAll()
    for request in requests { request.decide(.deny) }
  }
  func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
    snapshotID = ""
    denyPermissions()
  }
  func webView(_ webView: WKWebView, requestMediaCapturePermissionFor origin: WKSecurityOrigin,
    initiatedByFrame frame: WKFrameInfo, type: WKMediaCaptureType,
    decisionHandler: @escaping (WKPermissionDecision) -> Void) {
    let requesting = origin.protocol + "://" + origin.host + (origin.port > 0 ? ":\(origin.port)" : "")
    guard let url = webView.url, let requested = URL(string: requesting),
      url.scheme == requested.scheme, url.host == requested.host,
      (url.port ?? (url.scheme == "https" ? 443 : 80)) == (requested.port ?? (requested.scheme == "https" ? 443 : 80)),
      (try? policy.checkURL(url.absoluteString)) != nil, pendingPermissions.count < 8 else { decisionHandler(.deny); return }
    let kind: String
    switch type { case .camera: kind = "camera"; case .microphone: kind = "microphone"; case .cameraAndMicrophone: kind = "camera and microphone"; @unknown default: decisionHandler(.deny); return }
    pendingPermissions[UUID().uuidString] = PermissionRequest(origin: requesting, kind: kind, decide: decisionHandler)
  }
  func permissionDetails(_ args: [String: Any]) throws -> [String: Any] {
    try policy.require("browser")
    guard let url = view?.url, let id = args["id"] as? String, let request = pendingPermissions[id],
      args["snapshot"] as? String == snapshotID, !snapshotID.isEmpty,
      (try? policy.checkURL(url.absoluteString)) != nil else { throw Failure("Read the page and select a pending permission request.") }
    return ["id": id, "origin": request.origin, "permission": request.kind]
  }
  func permission(_ args: [String: Any]) throws -> [String: Any] {
    var result = try permissionDetails(args)
    guard let id = args["id"] as? String, let allow = args["allow"] as? Bool,
      let request = pendingPermissions.removeValue(forKey: id) else { throw Failure("Choose allow or deny for the pending request.") }
    snapshotID = ""
    request.decide(allow ? .grant : .deny)
    result["status"] = "decision_sent"; result["allow"] = allow
    result["next"] = "Read the page to check the outcome. macOS may still require direct user approval."
    return result
  }
  func toolbarAllowedItemIdentifiers(_ toolbar: NSToolbar) -> [NSToolbarItem.Identifier] {
    [
      NSToolbarItem.Identifier("workspace"), NSToolbarItem.Identifier("back"),
      NSToolbarItem.Identifier("forward"), NSToolbarItem.Identifier("reload"), .flexibleSpace,
    ]
  }
  func toolbarDefaultItemIdentifiers(_ toolbar: NSToolbar) -> [NSToolbarItem.Identifier] {
    [
      NSToolbarItem.Identifier("workspace"), .flexibleSpace, NSToolbarItem.Identifier("back"),
      NSToolbarItem.Identifier("forward"), NSToolbarItem.Identifier("reload"),
    ]
  }
  func toolbar(
    _ toolbar: NSToolbar, itemForItemIdentifier id: NSToolbarItem.Identifier,
    willBeInsertedIntoToolbar flag: Bool
  ) -> NSToolbarItem? {
    let item = NSToolbarItem(itemIdentifier: id)
    let titles = [
      "workspace": "← Workspace", "back": "Back", "forward": "Forward", "reload": "Reload",
    ]
    guard let title = titles[id.rawValue] else { return nil }
    item.label = title
    let button = NSButton(title: title, target: self, action: #selector(browserToolbarAction(_:)))
    button.identifier = NSUserInterfaceItemIdentifier(id.rawValue)
    item.view = button
    return item
  }
  @objc func browserToolbarAction(_ sender: NSButton) {
    switch sender.identifier?.rawValue {
    case "workspace":
      NSApp.windows.first(where: { $0.title.hasPrefix("CyMalika —") })?.makeKeyAndOrderFront(nil)
    case "back": view?.goBack()
    case "forward": view?.goForward()
    case "reload":
      if policy.grants.contains("browser"), let u = view?.url,
        (try? policy.checkURL(u.absoluteString)) != nil
      {
        view?.reload()
      }
    default: break
    }
  }
  func webView(
    _ webView: WKWebView, decidePolicyFor action: WKNavigationAction,
    decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
  ) {
    guard let u = action.request.url, (try? policy.checkURL(u.absoluteString)) != nil,
      policy.grants.contains("browser")
    else {
      decisionHandler(.cancel)
      return
    }
    decisionHandler(.allow)
  }
  func capture(_ completion: @escaping (Result<Any, Error>) -> Void) {
    do {
      guard secrets.isEmpty else { throw Failure("Use redacted text observations after password entry; close this browser session before requesting images.") }
      try policy.require("browser")
      guard let view, let url = view.url else { throw Failure("Open a browser page first.") }
      _ = try policy.checkURL(url.absoluteString)
      let config = WKSnapshotConfiguration()
      config.snapshotWidth = 1100
      view.takeSnapshot(with: config) { image, error in
        if let error {
          completion(.failure(error))
          return
        }
        guard let image, let tiff = image.tiffRepresentation,
          let rep = NSBitmapImageRep(data: tiff),
          let data = rep.representation(using: .jpeg, properties: [.compressionFactor: 0.65]),
          data.count < 8_000_000
        else {
          completion(.failure(Failure("Could not capture the browser page.")))
          return
        }
        completion(
          .success([
            "data": data.base64EncodedString(), "mime": "image/jpeg", "width": rep.pixelsWide,
            "height": rep.pixelsHigh, "url": url.absoluteString,
          ]))
      }
    } catch { completion(.failure(error)) }
  }
  func read(_ completion: @escaping (Result<Any, Error>) -> Void) {
    do {
      try policy.require("browser")
      guard let view, let url = view.url else {
        throw Failure("Open an approved URL in CyMalika Browser first.")
      }
      _ = try policy.checkURL(url.absoluteString)
      let token = UUID().uuidString
      snapshotID = token
      view.evaluateJavaScript(
        """
        (()=>{const candidates=[...document.querySelectorAll('a[href],button,input:not([type=hidden]),textarea,select')].slice(0,180); const items=candidates.map((e,i)=>{e.setAttribute('data-cymalika-ref','\(token)-'+i);return {id:String(i),tag:e.tagName.toLowerCase(),label:(e.innerText||e.getAttribute('aria-label')||e.placeholder||'').slice(0,180),type:e.type||'',secure:e.type==='password',filled:e.type==='password'?!!e.value:undefined,value:e.type==='password'?'[redacted]':(e.value||'').slice(0,200)}});return {url:location.href,title:document.title,text:document.body.innerText.slice(0,28000),elements:items,snapshot:'\(token)'}})()
        """
      ) { result, error in
        if let error { completion(.failure(error)) } else {
          func redact(_ value: Any) -> Any {
            if let text = value as? String { return self.secrets.reduce(text) { $0.replacingOccurrences(of: $1, with: "[redacted]") } }
            if let rows = value as? [Any] { return rows.map(redact) }
            if let fields = value as? [String: Any] { return fields.mapValues(redact) }
            return value
          }
          var response = redact(result ?? [:]) as? [String: Any] ?? [:]
          response["permissions"] = self.pendingPermissions.map { ["id": $0.key, "origin": $0.value.origin, "permission": $0.value.kind] }
          completion(.success(response))
        }
      }
    } catch { completion(.failure(error)) }
  }
  func fillPassword(_ args: [String: Any], completion: @escaping (Result<Any, Error>) -> Void) {
    do {
      try policy.require("browser")
      guard let view, let url = view.url, let token = args["snapshot"] as? String,
        token == snapshotID, !token.isEmpty, let id = args["element"] as? String, Int(id) != nil
      else { throw Failure("Choose a password field from a fresh browser snapshot.") }
      _ = try policy.checkURL(url.absoluteString)
      let ref = token + "-" + id
      let keyData = try JSONSerialization.data(withJSONObject: [ref])
      let keyJSON = String(data: keyData, encoding: .utf8)!
      let epoch = policy.epoch
      view.evaluateJavaScript("(()=>{const e=document.querySelector('[data-cymalika-ref=\"'+\(keyJSON)[0]+'\"]');return !!(e&&e.type==='password'&&e.getClientRects().length)})()") { value, error in
        guard error == nil, value as? Bool == true, self.snapshotID == token else { completion(.failure(Failure("Choose a visible password field."))); return }
        SecurePasswordPrompt.shared.request("Website: " + url.absoluteString + "\nField: Password") { secret in
          guard let secret else { completion(.success(["status": "rejected"])); return }
          guard self.policy.epoch == epoch, self.snapshotID == token, self.view === view, self.window?.isVisible == true, view.url == url,
            (try? self.policy.checkURL(url.absoluteString)) != nil else { completion(.failure(Failure("Password target changed or access was revoked."))); return }
          self.snapshotID = ""
          self.secrets.insert(secret)
          guard let data = try? JSONSerialization.data(withJSONObject: [ref, secret, url.absoluteString]),
            let json = String(data: data, encoding: .utf8) else { completion(.failure(Failure("Secure entry encoding failed."))); return }
          view.evaluateJavaScript("(()=>{const [key,value,url]=\(json);if(location.href!==url)throw Error('Target changed');const e=document.querySelector('[data-cymalika-ref=\"'+key+'\"]');if(!e||e.type!=='password'||!e.getClientRects().length)throw Error('Field changed');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,value);e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));return {status:'filled',submitted:false}})()") { _, error in
            if error != nil { completion(.failure(Failure("Password entry failed: the field or page changed. Inspect it again."))) }
            else { completion(.success(["status": "filled", "submitted": false])) }
          }
        }
      }
    } catch { completion(.failure(error)) }
  }
  func action(_ args: [String: Any], _ completion: @escaping (Result<Any, Error>) -> Void) {
    do {
      try policy.require("browser")
      guard let view, let url = view.url else { throw Failure("No browser page is open.") }
      _ = try policy.checkURL(url.absoluteString)
      guard args["snapshot"] as? String == snapshotID, !snapshotID.isEmpty,
        let id = args["element"] as? String, Int(id) != nil
      else { throw Failure("Read a fresh browser snapshot first.") }
      let key = snapshotID + "-" + id
      let op = args["operation"] as? String ?? ""
      guard ["click", "fill"].contains(op) else {
        throw Failure("Browser actions are click or fill.")
      }
      let data = try JSONSerialization.data(withJSONObject: [
        key, op, args["text"] as? String ?? "",
      ])
      let json = String(data: data, encoding: .utf8)!
      snapshotID = ""
      view.evaluateJavaScript(
        """
        (()=>{const [key,op,text]=\(json);const e=document.querySelector('[data-cymalika-ref="'+key+'"]');if(!e)throw Error('Element changed; read the page again.');if(e.type==='password'||e.type==='file')throw Error('Use password_fill for passwords; file fields require direct input.');if(op==='click'){e.click()}else{if(!['INPUT','TEXTAREA','SELECT'].includes(e.tagName))throw Error('This element is not editable.');const proto=e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:e.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(e,text);e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}))}return {status:'performed',operation:op,next:'Read the page again to verify.'}})()
        """
      ) { result, error in
        if let error { completion(.failure(error)) } else { completion(.success(result ?? [:])) }
      }
    } catch { completion(.failure(error)) }
  }
}

// Separate from the selected coding project: session file access never changes project scope.
final class PersonalFiles {
  let workspace: Workspace
  let home: URL
  init(storage: URL, home: URL = FileManager.default.homeDirectoryForCurrentUser) {
    self.home = home.resolvingSymlinksInPath().standardizedFileURL
    workspace = Workspace(storage: storage)
    workspace.root = self.home
  }
  func relative(_ raw: String) throws -> String {
    var value = raw
    if value == "~" { value = "" }
    if value.hasPrefix("~/") { value = String(value.dropFirst(2)) }
    if value.hasPrefix("/") {
      let absolute = URL(fileURLWithPath: value).standardizedFileURL.path
      guard absolute == home.path || absolute.hasPrefix(home.path + "/") else { throw Failure("Computer file tools stay inside your user folder.") }
      value = absolute == home.path ? "" : String(absolute.dropFirst(home.path.count + 1))
    }
    let protected = Set(["library", "appdata", "keychain", "keychains", "login data", "cookies", "credentials", "id_rsa", "id_ed25519", "wallet.dat"])
    guard !value.split(separator: "/").contains(where: { $0.hasPrefix(".") || protected.contains($0.lowercased()) }) else { throw Failure("Hidden folders and credential stores are not available to the model.") }
    return value
  }
  func directory(_ path: String) throws -> URL {
    let rel = try relative(path)
    let url = rel.isEmpty ? home : try workspace.resolve(rel)
    var directory: ObjCBool = false
    guard FileManager.default.fileExists(atPath: url.path, isDirectory: &directory), directory.boolValue else { throw Failure("Choose a directory.") }
    return url
  }
  func inspect(_ operation: String, _ path: String) throws -> [String: Any] {
    let rel = try relative(path)
    if operation == "read" {
      let result = try workspace.read(rel)
      guard (result["content"] as? String ?? "").count <= 45000 else { throw Failure("File exceeds the 45,000-character read limit. Use a reviewed command to inspect a relevant section instead of replacing unread content.") }
      return result
    }
    guard operation == "list" else { throw Failure("Use list or read.") }
    let folder = try directory(path)
    let children = try FileManager.default.contentsOfDirectory(at: folder, includingPropertiesForKeys: [.isDirectoryKey, .isSymbolicLinkKey], options: [.skipsHiddenFiles]).sorted { $0.lastPathComponent < $1.lastPathComponent }
    var entries: [[String: String]] = []
    for child in children {
      let item = String(child.path.dropFirst(home.path.count + 1))
      guard (try? relative(item)) != nil, (try? workspace.resolve(item)) != nil, let info = try? child.resourceValues(forKeys: [.isDirectoryKey, .isSymbolicLinkKey]), info.isSymbolicLink != true else { continue }
      entries.append(["path": item, "name": child.lastPathComponent, "kind": info.isDirectory == true ? "folder" : "file"])
      if entries.count >= 150 { break }
    }
    return ["home": home.path, "path": folder.path, "entries": entries, "truncated": entries.count >= 150 && children.count > 150]
  }
}
