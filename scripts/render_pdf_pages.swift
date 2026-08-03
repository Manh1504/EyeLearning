import AppKit
import PDFKit

if CommandLine.arguments.count < 3 {
    fputs("Usage: render_pdf_pages.swift input.pdf output_dir [scale]\n", stderr)
    exit(2)
}

let inputURL = URL(fileURLWithPath: CommandLine.arguments[1])
let outputURL = URL(fileURLWithPath: CommandLine.arguments[2], isDirectory: true)
let scale = CommandLine.arguments.count >= 4 ? (Double(CommandLine.arguments[3]) ?? 2.0) : 2.0

guard let document = PDFDocument(url: inputURL) else {
    fputs("Cannot open PDF: \(inputURL.path)\n", stderr)
    exit(1)
}

try FileManager.default.createDirectory(at: outputURL, withIntermediateDirectories: true)

for index in 0..<document.pageCount {
    guard let page = document.page(at: index) else { continue }
    let bounds = page.bounds(for: .mediaBox)
    let width = Int(bounds.width * scale)
    let height = Int(bounds.height * scale)
    guard let bitmap = NSBitmapImageRep(
        bitmapDataPlanes: nil,
        pixelsWide: width,
        pixelsHigh: height,
        bitsPerSample: 8,
        samplesPerPixel: 4,
        hasAlpha: true,
        isPlanar: false,
        colorSpaceName: .deviceRGB,
        bytesPerRow: 0,
        bitsPerPixel: 0
    ) else {
        fputs("Cannot allocate page \(index + 1)\n", stderr)
        continue
    }

    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: bitmap)
    NSColor.white.set()
    NSBezierPath(rect: NSRect(x: 0, y: 0, width: width, height: height)).fill()
    let context = NSGraphicsContext.current!.cgContext
    context.saveGState()
    context.scaleBy(x: CGFloat(scale), y: CGFloat(scale))
    page.draw(with: .mediaBox, to: context)
    context.restoreGState()
    NSGraphicsContext.restoreGraphicsState()

    guard let data = bitmap.representation(using: .png, properties: [:]) else {
        fputs("Cannot encode page \(index + 1)\n", stderr)
        continue
    }
    let fileName = String(format: "slide-%02d.png", index + 1)
    try data.write(to: outputURL.appendingPathComponent(fileName))
}

print("Rendered \(document.pageCount) pages")
