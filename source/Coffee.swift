import Foundation
import IOKit.pwr_mgt

final class CoffeeAwake {
  private var assertions: [IOPMAssertionID] = []
  var enabled: Bool { !assertions.isEmpty }

  func setEnabled(_ enabled: Bool) throws -> [String: Bool] {
    if enabled && !self.enabled {
      for kind in [kIOPMAssertionTypePreventUserIdleSystemSleep as CFString, kIOPMAssertionTypePreventUserIdleDisplaySleep as CFString, kIOPMAssertPreventDiskIdle as CFString] {
        var id = IOPMAssertionID(0)
        let result = IOPMAssertionCreateWithName(kind as CFString, IOPMAssertionLevel(kIOPMAssertionLevelOn), "CyMalika Coffee — keep awake" as CFString, &id)
        guard result == kIOReturnSuccess else {
          stop()
          throw Failure("macOS could not start Coffee mode. Your normal sleep settings are unchanged.")
        }
        assertions.append(id)
      }
    } else if !enabled {
      stop()
    }
    return ["enabled": self.enabled]
  }

  func stop() {
    assertions.forEach { _ = IOPMAssertionRelease($0) }
    assertions.removeAll()
  }

  deinit { stop() }
}
