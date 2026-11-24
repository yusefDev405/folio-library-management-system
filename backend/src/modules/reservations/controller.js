import * as service from './service.js';

export function createReservation(req, res, next) {
  try {
    const reservation = service.createReservation(req.validated.body.bookId, req.user);
    res.status(201).json({ data: reservation });
  } catch (err) {
    next(err);
  }
}

export function listMyReservations(req, res, next) {
  try {
    res.json({ data: service.listMyReservations(req.user) });
  } catch (err) {
    next(err);
  }
}

export function cancelReservation(req, res, next) {
  try {
    service.cancelReservation(req.validated.params.id, req.user);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}
