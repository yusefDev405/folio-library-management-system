import * as service from './service.js';

export function checkout(req, res, next) {
  try {
    const result = service.checkout(req.validated.body, req.user.id);
    res.status(201).json({ data: result });
  } catch (err) {
    next(err);
  }
}

export function returnBook(req, res, next) {
  try {
    const result = service.returnBook(req.validated.body, req.user.id);
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
}

export function renewLoan(req, res, next) {
  try {
    const result = service.renewLoan(req.validated.params.id, req.user);
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
}

export function listLoans(req, res, next) {
  try {
    res.json(service.listLoans(req.validated.query));
  } catch (err) {
    next(err);
  }
}

export function listMyLoans(req, res, next) {
  try {
    res.json(service.listMyLoans(req.user, req.validated.query, false));
  } catch (err) {
    next(err);
  }
}

export function listMyLoanHistory(req, res, next) {
  try {
    res.json(service.listMyLoans(req.user, req.validated.query, true));
  } catch (err) {
    next(err);
  }
}
