import Flutter
import UIKit
import AVKit
import AVFoundation

@main
@objc class AppDelegate: FlutterAppDelegate, FlutterImplicitEngineDelegate {
  private var najdPip: NajdPipController?
  override func application(_ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }
  func didInitializeImplicitFlutterEngine(_ engineBridge: FlutterImplicitEngineBridge) {
    GeneratedPluginRegistrant.register(with: engineBridge.pluginRegistry)
    if let registrar = engineBridge.pluginRegistry.registrar(forPlugin: "NajdPip") {
      najdPip = NajdPipController(messenger: registrar.messenger())
    }
  }
}

/// AVKit owns only the OS PiP session. The normal player remains media_kit.
/// We transfer its clock into AVPlayer and return the final clock on restoration.
final class NajdPipController: NSObject, AVPictureInPictureControllerDelegate {
  private let channel: FlutterMethodChannel
  private var player: AVPlayer?
  private var layer: AVPlayerLayer?
  private var controller: AVPictureInPictureController?
  private var ready: NSKeyValueObservation?
  private var possible: NSKeyValueObservation?
  private var displayReady: NSKeyValueObservation?
  private var ticker: Any?
  private var pending: FlutterResult?
  private var session = ""
  private var seekReady = false
  private var starting = false
  private var restoring = false
  private var restorePlaying = false
  private var requestedRate: Float = 1
  private var desiredPlaying = true

  init(messenger: FlutterBinaryMessenger) {
    channel = FlutterMethodChannel(name: "najd/pip", binaryMessenger: messenger)
    super.init()
    channel.setMethodCallHandler { [weak self] call, result in self?.handle(call, result) }
  }
  private func handle(_ call: FlutterMethodCall, _ result: @escaping FlutterResult) {
    let args = call.arguments as? [String: Any] ?? [:]
    switch call.method {
    case "supported": result(AVPictureInPictureController.isPictureInPictureSupported())
    case "update": result(true)
    case "enter": enter(args, result)
    case "close":
      if args["session"] as? String == session {
        if controller?.isPictureInPictureActive == true {
          restoring = false
          controller?.stopPictureInPicture()
        } else { if pending != nil { finishFailure() } else { cleanup() } }
      }
      result(true)
    default: result(FlutterMethodNotImplemented)
    }
  }
  private func seconds(_ time: CMTime) -> Double {
    let value = CMTimeGetSeconds(time)
    return value.isFinite ? max(0, value) : 0
  }
  private func emit(active: Bool, playing: Bool? = nil) {
    var data: [String: Any] = ["session": session, "active": active,
      "position_ms": Int(seconds(player?.currentTime() ?? .zero) * 1000),
      "duration_ms": Int(seconds(player?.currentItem?.duration ?? .zero) * 1000)]
    data["playing"] = playing ?? ((player?.rate ?? 0) > 0)
    channel.invokeMethod("pipState", arguments: data)
  }
  private func enter(_ args: [String: Any], _ result: @escaping FlutterResult) {
    guard AVPictureInPictureController.isPictureInPictureSupported(), pending == nil,
      let text = args["url"] as? String, text.count <= 8192, let url = URL(string: text),
      url.user == nil, url.password == nil,
      (url.scheme == "https" || url.isFileURL ||
        (url.scheme == "http" && ["127.0.0.1", "localhost"].contains(url.host ?? ""))),
      let view = UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene })
        .flatMap({ $0.windows }).first(where: { $0.isKeyWindow })?.rootViewController?.view
      else { result(false); return }
    cleanup()
    session = args["session"] as? String ?? ""
    pending = result
    requestedRate = min(4, max(0.5, (args["rate"] as? NSNumber)?.floatValue ?? 1))
    desiredPlaying = args["playing"] as? Bool ?? true
    restoring = false
    restorePlaying = false
    seekReady = false
    starting = false
    do {
      try AVAudioSession.sharedInstance().setCategory(.playback, mode: .moviePlayback)
      try AVAudioSession.sharedInstance().setActive(true)
    } catch { finishFailure(); return }
    let supplied = args["headers"] as? [String: String] ?? [:]
    let headers = supplied.filter { !$0.key.contains("\n") && !$0.value.contains("\n") &&
      !$0.key.contains("\r") && !$0.value.contains("\r") && $0.value.count <= 8192 }
    let asset = AVURLAsset(url: url, options: ["AVURLAssetHTTPHeaderFieldsKey": headers])
    let item = AVPlayerItem(asset: asset)
    let video = AVPlayer(playerItem: item)
    let output = AVPlayerLayer(player: video)
    output.videoGravity = .resizeAspect
    output.frame = view.bounds
    view.layer.addSublayer(output)
    player = video
    layer = output
    controller = AVPictureInPictureController(playerLayer: output)
    controller?.delegate = self
    if #available(iOS 14.2, *) {
      controller?.canStartPictureInPictureAutomaticallyFromInline = true
    }
    displayReady = output.observe(\.isReadyForDisplay, options: [.initial, .new]) { [weak self] _, _ in
      DispatchQueue.main.async { self?.attemptStart() }
    }
    let position = max(0, (args["position_ms"] as? NSNumber)?.doubleValue ?? 0) / 1000
    ready = item.observe(\.status, options: [.initial, .new]) { [weak self] current, _ in
      guard let self = self else { return }
      if current.status == .failed { DispatchQueue.main.async { self.finishFailure() }; return }
      guard current.status == .readyToPlay, !self.seekReady else { return }
      // A non-DVR live stream starts at the live edge, without an invalid seek.
      if current.duration.isIndefinite && current.seekableTimeRanges.isEmpty {
        DispatchQueue.main.async {
          guard self.pending != nil else { return }
          self.seekReady = true
          self.player?.playImmediately(atRate: self.requestedRate)
          self.attemptStart()
        }
        return
      }
      self.player?.seek(to: CMTime(seconds: position, preferredTimescale: 600),
        toleranceBefore: .zero, toleranceAfter: .zero) { [weak self] completed in
        DispatchQueue.main.async {
          guard let self = self, self.pending != nil else { return }
          guard completed else { self.finishFailure(); return }
          self.seekReady = true
          self.player?.playImmediately(atRate: self.requestedRate)
          self.attemptStart()
        }
      }
    }
    possible = controller?.observe(\.isPictureInPicturePossible, options: [.initial, .new]) { [weak self] _, _ in
      DispatchQueue.main.async { self?.attemptStart() }
    }
    ticker = video.addPeriodicTimeObserver(forInterval: CMTime(seconds: 5, preferredTimescale: 600), queue: .main) { [weak self] _ in
      guard let self = self, self.controller?.isPictureInPictureActive == true, self.seekReady else { return }
      self.emit(active: true)
    }
    let expected = session
    DispatchQueue.main.asyncAfter(deadline: .now() + 20) { [weak self] in
      if let self = self, self.session == expected, self.pending != nil { self.finishFailure() }
    }
  }
  private func attemptStart() {
    guard pending != nil, seekReady, !starting, layer?.isReadyForDisplay == true,
      controller?.isPictureInPicturePossible == true else { return }
    starting = true
    controller?.startPictureInPicture()
  }
  private func finishFailure() {
    let callback = pending
    pending = nil
    cleanup()
    callback?(false)
  }
  private func cleanup() {
    ready?.invalidate(); ready = nil
    possible?.invalidate(); possible = nil
    displayReady?.invalidate(); displayReady = nil
    if let ticker = ticker { player?.removeTimeObserver(ticker) }
    ticker = nil
    player?.pause()
    layer?.removeFromSuperlayer()
    layer = nil; controller = nil; player = nil
    seekReady = false; starting = false
  }
  func pictureInPictureControllerDidStartPictureInPicture(_ pictureInPictureController: AVPictureInPictureController) {
    if !desiredPlaying { player?.pause() }
    emit(active: true)
    let callback = pending; pending = nil; callback?(true)
  }
  func pictureInPictureController(_ pictureInPictureController: AVPictureInPictureController,
    failedToStartPictureInPictureWithError error: Error) { finishFailure() }
  func pictureInPictureControllerWillStopPictureInPicture(_ pictureInPictureController: AVPictureInPictureController) {
    restorePlaying = (player?.rate ?? 0) > 0
  }
  func pictureInPictureControllerDidStopPictureInPicture(_ pictureInPictureController: AVPictureInPictureController) {
    emit(active: false, playing: restoring && restorePlaying)
    cleanup()
  }
  func pictureInPictureController(_ pictureInPictureController: AVPictureInPictureController,
    restoreUserInterfaceForPictureInPictureStopWithCompletionHandler completionHandler: @escaping (Bool) -> Void) {
    restoring = true
    completionHandler(true)
  }
}
