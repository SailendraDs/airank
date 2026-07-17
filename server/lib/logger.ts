import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';

const isProduction = process.env.NODE_ENV === 'production';
const isDevelopment = process.env.NODE_ENV === 'development';

// Define log format
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

// Console format for development
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let msg = `${timestamp} [${level}] ${message}`;
    if (Object.keys(meta).length > 0) {
      msg += ` ${JSON.stringify(meta)}`;
    }
    return msg;
  })
);

// Create transports
const transports: winston.transport[] = [];

// Console transport (always enabled)
transports.push(
  new winston.transports.Console({
    format: isDevelopment ? consoleFormat : logFormat,
    level: isDevelopment ? 'debug' : 'info',
  })
);

// File transports for production
if (isProduction) {
  // Error logs
  transports.push(
    new DailyRotateFile({
      filename: 'logs/error-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      level: 'error',
      maxSize: '20m',
      maxFiles: '14d',
      format: logFormat,
    })
  );

  // Combined logs
  transports.push(
    new DailyRotateFile({
      filename: 'logs/combined-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '14d',
      format: logFormat,
    })
  );
}

// Create logger instance
export const logger = winston.createLogger({
  level: isDevelopment ? 'debug' : 'info',
  format: logFormat,
  transports,
  exitOnError: false,
});

// Add request logging helper
export function logRequest(method: string, path: string, statusCode: number, duration: number, meta?: any) {
  const level = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info';
  logger.log(level, `${method} ${path} ${statusCode} ${duration}ms`, meta);
}

// Add error logging helper
export function logError(error: Error, context?: any) {
  logger.error('Application error', {
    message: error.message,
    stack: error.stack,
    ...context,
  });
}

// Add security event logging
export function logSecurityEvent(event: string, details: any) {
  logger.warn('Security event', {
    event,
    ...details,
    timestamp: new Date().toISOString(),
  });
}

// Add audit logging helper
export function logAudit(action: string, userId: string, details: any) {
  logger.info('Audit log', {
    action,
    userId,
    ...details,
    timestamp: new Date().toISOString(),
  });
}

// Stream for Morgan HTTP logger
export const morganStream = {
  write: (message: string) => {
    logger.info(message.trim());
  },
};

// Log startup
logger.info('Logger initialized', {
  environment: process.env.NODE_ENV,
  level: logger.level,
});

export default logger;

