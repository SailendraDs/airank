import type { Request, Response, NextFunction } from 'express';
import { storage } from '../storage';

export function apiLoggerMiddleware(req: Request, res: Response, next: NextFunction) {
  if (!req.path.startsWith('/api/')) {
    return next();
  }

  const startTime = Date.now();
  const originalEnd = res.end;

  res.end = function (this: Response, ...args: any[]) {
    const responseTime = Date.now() - startTime;
    const statusCode = res.statusCode;

    let level = 'info';
    if (statusCode >= 500) level = 'error';
    else if (statusCode >= 400) level = 'warning';
    else if (statusCode >= 200 && statusCode < 300) level = 'success';

    const userId = (req as any).user?.id || null;
    const brandId = (req.params?.brandId as string | undefined) || null;

    storage.createApiLog({
      method: req.method,
      url: req.path,
      statusCode,
      responseTime,
      userId,
      brandId,
      errorMessage: statusCode >= 400 ? (res as any)._errorMessage || null : null,
      level,
      userAgent: req.headers['user-agent'] || null,
      ip: req.ip || req.socket.remoteAddress || null,
    }).catch(() => {});

    return originalEnd.apply(this, args as any);
  } as any;

  next();
}
