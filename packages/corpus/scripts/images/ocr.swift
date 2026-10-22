import Foundation
import Vision
import ImageIO

// Actual OCR over PNG pixels. No access to labels, diagram specs or note text.
let args = CommandLine.arguments
if args.count != 3 { fatalError("usage: swift ocr.swift CORPUS_DIRECTORY FRESH_OUTPUT_JSON") }
let root = URL(fileURLWithPath: args[1], isDirectory: true)
let output = URL(fileURLWithPath: args[2])
let manifestData = try Data(contentsOf: root.appendingPathComponent("manifest.json"))
let manifest = try JSONSerialization.jsonObject(with: manifestData) as! [String: Any]
let figures = manifest["figures"] as! [[String: Any]]
let start = Date()
var records: [[String: Any]] = []
for figure in figures {
    let began = Date()
    let url = root.appendingPathComponent(figure["image"] as! String)
    let request = VNRecognizeTextRequest()
    request.revision = VNRecognizeTextRequestRevision3
    request.recognitionLevel = .accurate
    request.recognitionLanguages = ["en-US"]
    request.usesLanguageCorrection = false
    try VNImageRequestHandler(url: url).perform([request])
    let lines = (request.results ?? []).compactMap { observation -> [String: Any]? in
        guard let text = observation.topCandidates(1).first else { return nil }
        let b = observation.boundingBox
        return ["text": text.string, "confidence": text.confidence,
                "box": [Double(b.minX), Double(b.minY), Double(b.width), Double(b.height)]]
    }.sorted { a, b in
        let x = a["box"] as! [Double], y = b["box"] as! [Double]
        return abs(x[1] - y[1]) > 0.02 ? x[1] > y[1] : x[0] < y[0]
    }
    records.append(["id": figure["id"]!, "imageSha256": figure["imageSha256"]!,
                    "text": lines.map { $0["text"] as! String }.joined(separator: "\n"),
                    "lines": lines, "elapsedMs": Date().timeIntervalSince(began) * 1000])
}
let iso = ISO8601DateFormatter()
let result: [String: Any] = ["version": "image-ocr-1", "engine": "Apple Vision VNRecognizeTextRequest",
    "revision": VNRecognizeTextRequestRevision3, "recognitionLevel": "accurate", "languages": ["en-US"],
    "languageCorrection": false, "os": ProcessInfo.processInfo.operatingSystemVersionString,
    "startedAt": iso.string(from: start), "completedAt": iso.string(from: Date()),
    "totalMs": Date().timeIntervalSince(start) * 1000, "records": records]
try JSONSerialization.data(withJSONObject: result, options: [.prettyPrinted, .sortedKeys]).write(to: output, options: .withoutOverwriting)
print("Recognized \(records.count) real images; wrote \(output.lastPathComponent)")
