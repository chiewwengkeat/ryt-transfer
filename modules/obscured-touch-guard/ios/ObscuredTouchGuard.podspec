Pod::Spec.new do |s|
  s.name           = 'ObscuredTouchGuard'
  s.version        = '1.0.0'
  s.summary        = 'Drops touches that reach the app through a window another app draws over it.'
  s.author         = 'Chiew Weng Keat'
  s.homepage       = 'https://github.com/chiewwengkeat/ryt-transfer'
  s.platforms      = { :ios => '16.4' }
  s.source         = { git: 'https://github.com/chiewwengkeat/ryt-transfer.git' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files = '**/*.{h,m,swift}'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
