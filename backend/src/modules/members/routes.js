import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/requireRole.js';
import { validate } from '../../middleware/validate.js';
import * as controller from './controller.js';
import {
  createMemberSchema,
  listMembersQuerySchema,
  memberIdParamSchema,
  updateMemberSchema,
} from './schema.js';

export function createMembersRouter() {
  const router = Router();

  router.get(
    '/members',
    authenticate,
    requireRole('librarian'),
    validate({ query: listMembersQuerySchema }),
    controller.listMembers
  );

  router.get(
    '/members/:id',
    authenticate,
    requireRole('librarian'),
    validate({ params: memberIdParamSchema }),
    controller.getMember
  );

  router.post(
    '/members',
    authenticate,
    requireRole('librarian'),
    validate({ body: createMemberSchema }),
    controller.createMember
  );

  router.patch(
    '/members/:id',
    authenticate,
    requireRole('librarian'),
    validate({ params: memberIdParamSchema, body: updateMemberSchema }),
    controller.updateMember
  );

  return router;
}
