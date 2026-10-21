# Preflight history

The initial `artifacts/preflight-freeze.json` is retained. Its entire `files`
map equals the final freeze's map: no image, source snapshot, config, question,
label or protocol was changed during implementation repairs or after rankings.
A test checks this equality. Only execution code was corrected before complete
observations. The final freeze binds the corrected code.

- An initial root-directory `node --import tsx` command could not resolve the
  workspace-local loader. The documented command runs through the corpus
  package's dependency resolution.
- Apple Vision initialization failed inside the restricted execution sandbox.
  Running against the same repository-authored images with access to the system
  OCR runtime worked. The first such preflight found a Swift `CGFloat` to
  `Double` cast error while sorting recognized boxes. Coordinates are now
  converted explicitly; no partial OCR result from either failed invocation was
  substituted into the committed 24-image observation.
- Initial sequential model download was too slow. It was stopped before any
  complete CLIP encoding pass. The same fixed q8 model files were acquired by
  parallel byte ranges, assembled and checked against the official LFS SHA256
  metadata. Acquisition duration and this excluded earlier wait are recorded in
  `artifacts/weights-download.json`. Inference subsequently loads verified cached
  weights. This changes acquisition, not weights, preprocessing or queries.

These are setup failures, not retrieval failure cases. Retrieval failures and
no-gain cases are reported separately from complete original rankings.
