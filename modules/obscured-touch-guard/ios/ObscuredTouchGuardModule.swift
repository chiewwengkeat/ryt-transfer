import ExpoModulesCore

// iOS lets no other app draw over this one, so there is no touch to filter.
public class ObscuredTouchGuardModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ObscuredTouchGuard")
    Events("onObscuredTouchDropped")

    Function("enable") {}
    Function("disable") {}
  }
}
