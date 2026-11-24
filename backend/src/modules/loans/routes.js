import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/requireRole.js';
import { validate } from '../../middleware/validate.js';
import * as controller from './controller.js';
import {
  checkoutSchema,
  listLoansQuerySchema,
  loanIdParamSchema,
  myLoansQuerySchema,
  returnSchema,
} from './schema.js';

export function createLoansRouter() {
  const router = Router();

  router.post(
    '/loans/checkout',
    authenticate,
    requireRole('librarian'),
    validate({ body: checkoutSchema }),
    controller.checkout
  );

  router.post(
    '/loans/return',
    authenticate,
    requireRole('librarian'),
    validate({ body: returnSchema }),
    controller.returnBook
  );

  router.post(
    '/loans/:id/renew',
    authenticate,
    requireRole('member', 'librarian'),
    validate({ params: loanIdParamSchema }),
    controller.renewLoan
  );

  router.get(
    '/loans',
    authenticate,
    requireRole('librarian'),
    validate({ query: listLoansQuerySchema }),
    controller.listLoans
  );

  router.get(
    '/me/loans',
    authenticate,
    requireRole('member'),
    validate({ query: myLoansQuerySchema }),
    controller.listMyLoans
  );

  router.get(
    '/me/loans/history',
    authenticate,
    requireRole('member'),
    validate({ query: myLoansQuerySchema }),
    controller.listMyLoanHistory
  );

  return router;
}
