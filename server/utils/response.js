export function ok(res, data = {}) {
  res.json({ ok: true, data })
}

export function fail(res, httpStatus, code, message) {
  res.status(httpStatus).json({
    ok: false,
    error: { code, message: message || code },
  })
}
