
import type {WriteTransaction} from 'replicache';
import {MessageWithID} from 'shared';

export type M = typeof mutators;

export const mutators = {
  async createMessage(
    tx: WriteTransaction,
    {id, from, content, order}: MessageWithID,
  ) {
    await tx.set(`message/${id}`, {
      from,
      content,
      order,
    });
  },
};
