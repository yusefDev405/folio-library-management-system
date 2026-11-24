import * as service from './service.js';

export function addCopy(req, res, next) {
  try {
    const copy = service.addCopy(req.validated.params.id, req.validated.body, req.user.id);
    res.status(201).json({ data: copy });
  } catch (err) {
    next(err);
  }
}

export function updateCopy(req, res, next) {
  try {
    const copy = service.updateCopy(req.validated.params.id, req.validated.body, req.user.id);
    res.json({ data: copy });
  } catch (err) {
    next(err);
  }
}
