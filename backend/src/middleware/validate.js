import { AppError } from '../utils/errors.js';

export function validate({ body, query, params } = {}) {
  return (req, _res, next) => {
    const validated = {};

    if (params) {
      const result = params.safeParse(req.params);
      if (!result.success) {
        return next(
          new AppError(400, 'VALIDATION_ERROR', 'Invalid path parameters.', formatZodIssues(result.error))
        );
      }
      validated.params = result.data;
    }

    if (query) {
      const result = query.safeParse(req.query);
      if (!result.success) {
        return next(
          new AppError(400, 'VALIDATION_ERROR', 'Invalid query parameters.', formatZodIssues(result.error))
        );
      }
      validated.query = result.data;
    }

    if (body) {
      const result = body.safeParse(req.body ?? {});
      if (!result.success) {
        return next(
          new AppError(400, 'VALIDATION_ERROR', 'Request body validation failed.', formatZodIssues(result.error))
        );
      }
      validated.body = result.data;
    }

    req.validated = validated;
    return next();
  };
}

function formatZodIssues(error) {
  return error.issues.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
  }));
}
