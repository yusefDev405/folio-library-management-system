import * as service from './service.js';

export function listMyFines(req, res, next) {
  try {
    res.json({ data: service.listMyFines(req.user) });
  } catch (err) {
    next(err);
  }
}

export function listFines(req, res, next) {
  try {
    res.json(service.listFines(req.validated.query));
  } catch (err) {
    next(err);
  }
}

export function payFine(req, res, next) {
  try {
    res.json({ data: service.payFine(req.validated.params.id, req.user.id) });
  } catch (err) {
    next(err);
  }
}

export function waiveFine(req, res, next) {
  try {
    res.json({ data: service.waiveFine(req.validated.params.id, req.user.id) });
  } catch (err) {
    next(err);
  }
}
