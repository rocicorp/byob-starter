import {push} from '../push.js';

import type {Response, Request, NextFunction} from 'express';

export async function handlePush(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    await push(req, res);
  } catch (e) {
    next(e);
  }
}
