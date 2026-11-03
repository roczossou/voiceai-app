export function errorHandler(err, req, res, _next) {
  const status = err.status || err.statusCode || 500
  const message = err.message || 'Internal Server Error'

  res.status(status).json({
    type: 'https://httpstatuses.com/' + status,
    title: message,
    status,
    detail: process.env.NODE_ENV !== 'production' ? err.stack : undefined,
    instance: req.path,
  })
}
