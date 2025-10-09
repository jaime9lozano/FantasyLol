import { ArgumentsHost, BadRequestException, Catch, ExceptionFilter, ForbiddenException, HttpException, HttpStatus, UnauthorizedException } from '@nestjs/common';

type ErrorBody = { code: string; message: string; details?: any };

@Catch()
export class GlobalHttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let body: ErrorBody = { code: 'INTERNAL_ERROR', message: 'Unexpected error' };

    if (exception instanceof BadRequestException) {
      status = HttpStatus.BAD_REQUEST;
      const response: any = exception.getResponse();
      body = {
        code: 'BAD_REQUEST',
        message: Array.isArray(response?.message) ? response.message.join('; ') : response?.message || 'Bad request',
        details: response,
      };
    } else if (exception instanceof UnauthorizedException) {
      status = HttpStatus.UNAUTHORIZED;
      body = { code: 'UNAUTHORIZED', message: exception.message || 'Unauthorized' };
    } else if (exception instanceof ForbiddenException) {
      status = HttpStatus.FORBIDDEN;
      body = { code: 'FORBIDDEN', message: exception.message || 'Forbidden' };
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const response: any = exception.getResponse();
      body = {
        code: 'HTTP_' + status,
        message: (response && (response.message || response.error)) || exception.message,
        details: response,
      };
    } else if (exception && typeof exception === 'object') {
      body = { code: 'INTERNAL_ERROR', message: (exception as any).message || 'Unexpected error' };
    }

    res.status(status).json(body);
  }
}
