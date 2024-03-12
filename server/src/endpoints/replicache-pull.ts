import type Express from 'express';
import {pull} from '../pull.js';

export async function handlePull(
  req: Express.Request,
  res: Express.Response,
  next: Express.NextFunction,
): Promise<void> {
  try {
    const resp = await pull(req, res);
    res.json(resp);
  } catch (e) {
    next(e);
  }
}
