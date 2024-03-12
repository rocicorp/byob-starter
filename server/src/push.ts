import {z} from 'zod';
import {serverID, tx, type Transaction} from './db';
import type {MessageWithID} from 'shared';
import type {MutationV1, PushRequestV1} from 'replicache';
import type {Request, Response} from 'express';
import {getPokeBackend} from './poke';

const pushRequestSchema = z.object({
  pushVersion: z.literal(1),
  schemaVersion: z.string(),
  clientGroupID: z.string(),
  profileID: z.string(),
  mutations: z.custom<MutationV1[]>(),
});

export async function push(req: Request, res: Response) {
  // Validate and parse the request body
  const parseResult = pushRequestSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).send('Invalid request body');
    return;
  }

  const push: PushRequestV1 = parseResult.data;
  console.log('Processing push', JSON.stringify(push));
  console.log('Processing push', JSON.stringify(push));

  const t0 = Date.now();
  try {
    // Iterate each mutation in the push.
    for (const mutation of push.mutations) {
      const t1 = Date.now();

      try {
        await tx(t => processMutation(t, push.clientGroupID, mutation));
      } catch (e) {
        console.error('Caught error from mutation', mutation, e);

        // Handle errors inside mutations by skipping and moving on. This is
        // convenient in development but you may want to reconsider as your app
        // gets close to production:
        // https://doc.replicache.dev/reference/server-push#error-handling
        await tx(t => processMutation(t, push.clientGroupID, mutation, e as string));
      }

      console.log('Processed mutation in', Date.now() - t1);
    }

    res.send('{}');

    getPokeBackend().poke('ping');
  } catch (e) {
    console.error(e);
    res.status(500).send(e);
  } finally {
    console.log('Processed push in', Date.now() - t0);
  }
}

async function processMutation(
  t: Transaction,
  clientGroupID: string,
  mutation: MutationV1,
  error?: string | undefined,
) {
  const {clientID} = mutation;

  // Get the previous version and calculate the next one.
  const {version: prevVersion} = await t.one(
    'select version from replicache_server where id = $1 for update',
    serverID,
  );
  const nextVersion = prevVersion + 1;

  const lastMutationID = await getLastMutationID(t, clientID);
  const nextMutationID = lastMutationID + 1;

  console.log('nextVersion', nextVersion, 'nextMutationID', nextMutationID);

  // It's common due to connectivity issues for clients to send a
  // mutation which has already been processed. Skip these.
  if (mutation.id < nextMutationID) {
    console.log(
      `Mutation ${mutation.id} has already been processed - skipping`,
    );
    return;
  }

  // If the Replicache client is working correctly, this can never
  // happen. If it does there is nothing to do but return an error to
  // client and report a bug to Replicache.
  if (mutation.id > nextMutationID) {
    throw new Error(
      `Mutation ${mutation.id} is from the future - aborting. This can happen in development if the server restarts. In that case, clear appliation data in browser and refresh.`,
    );
  }

  if (error === undefined) {
    console.log('Processing mutation:', JSON.stringify(mutation));

    // For each possible mutation, run the server-side logic to apply the
    // mutation.
    switch (mutation.name) {
      case 'createMessage':
        await createMessage(t, mutation.args as MessageWithID, nextVersion);
        break;
      default:
        throw new Error(`Unknown mutation: ${mutation.name}`);
    }
  } else {
    // TODO: You can store state here in the database to return to clients to
    // provide additional info about errors.
    console.log(
      'Handling error from mutation',
      JSON.stringify(mutation),
      error,
    );
  }

  console.log('setting', clientID, 'last_mutation_id to', nextMutationID);
  // Update lastMutationID for requesting client.
  await setLastMutationID(
    t,
    clientID,
    clientGroupID,
    nextMutationID,
    nextVersion,
  );

  // Update global version.
  await t.none('update replicache_server set version = $1 where id = $2', [
    nextVersion,
    serverID,
  ]);
}

export async function getLastMutationID(t: Transaction, clientID: string) {
  const clientRow = await t.oneOrNone(
    'select last_mutation_id from replicache_client where id = $1',
    clientID,
  );
  if (!clientRow) {
    return 0;
  }
  return parseInt(clientRow.last_mutation_id);
}

async function setLastMutationID(
  t: Transaction,
  clientID: string,
  clientGroupID: string,
  mutationID: number,
  version: number,
) {
  const result = await t.result(
    `update replicache_client set
      client_group_id = $2,
      last_mutation_id = $3,
      version = $4
    where id = $1`,
    [clientID, clientGroupID, mutationID, version],
  );
  if (result.rowCount === 0) {
    await t.none(
      `insert into replicache_client (
        id,
        client_group_id,
        last_mutation_id,
        version
      ) values ($1, $2, $3, $4)`,
      [clientID, clientGroupID, mutationID, version],
    );
  }
}

async function createMessage(
  t: Transaction,
  {id, from, content, order}: MessageWithID,
  version: number,
) {
  await t.none(
    `insert into message (
    id, sender, content, ord, deleted, version) values
    ($1, $2, $3, $4, false, $5)`,
    [id, from, content, order, version],
  );
}
