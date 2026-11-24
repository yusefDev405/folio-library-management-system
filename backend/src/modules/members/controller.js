import * as service from './service.js';

export function listMembers(req, res, next) {
  try {
    res.json(service.listMembers(req.validated.query));
  } catch (err) {
    next(err);
  }
}

export function getMember(req, res, next) {
  try {
    res.json({ data: service.getMember(req.validated.params.id) });
  } catch (err) {
    next(err);
  }
}

export async function createMember(req, res, next) {
  try {
    const member = await service.createMember(req.validated.body, req.user.id);
    res.status(201).json({ data: member });
  } catch (err) {
    next(err);
  }
}

export function updateMember(req, res, next) {
  try {
    const member = service.updateMember(
      req.validated.params.id,
      req.validated.body,
      req.user.id
    );
    res.json({ data: member });
  } catch (err) {
    next(err);
  }
}
