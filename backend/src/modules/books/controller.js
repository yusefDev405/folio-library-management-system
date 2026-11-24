import * as service from './service.js';

export function listBooks(req, res, next) {
  try {
    const result = service.listBooks(req.validated.query);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export function getBook(req, res, next) {
  try {
    const book = service.getBook(req.validated.params.id);
    res.json({ data: book });
  } catch (err) {
    next(err);
  }
}

export function createBook(req, res, next) {
  try {
    const book = service.createBook(req.validated.body, req.user.id);
    res.status(201).json({ data: book });
  } catch (err) {
    next(err);
  }
}

export function updateBook(req, res, next) {
  try {
    const book = service.updateBook(req.validated.params.id, req.validated.body, req.user.id);
    res.json({ data: book });
  } catch (err) {
    next(err);
  }
}
