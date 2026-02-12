const HYPERION_URL = process.env.HYPERION_URL || 'http://localhost:7000';

export async function getActions(params: {
  account?: string;
  filter?: string;
  skip?: number;
  limit?: number;
  sort?: 'asc' | 'desc';
}) {
  const query = new URLSearchParams({
    ...(params.account && { account: params.account }),
    ...(params.filter && { filter: params.filter }),
    skip: String(params.skip || 0),
    limit: String(params.limit || 20),
    sort: params.sort || 'desc',
  });

  const res = await fetch(`${HYPERION_URL}/v2/history/get_actions?${query}`);
  if (!res.ok) throw new Error(`Hyperion error: ${res.statusText}`);
  return res.json();
}

export async function getTransaction(txId: string) {
  const res = await fetch(`${HYPERION_URL}/v2/history/get_transaction?id=${txId}`);
  if (!res.ok) throw new Error(`Hyperion error: ${res.statusText}`);
  return res.json();
}

// Get chunks for a file by querying uploadchunk actions
export async function getFileChunks(fileId: number, owner: string) {
  const actions = await getActions({
    account: owner,
    filter: `verartacore:uploadchunk`,
    limit: 10000,
  });

  // Filter by file_id and sort by chunk_index
  const chunks = actions.actions
    .filter((action: any) => action.act.data.file_id === fileId)
    .sort((a: any, b: any) => a.act.data.chunk_index - b.act.data.chunk_index)
    .map((action: any) => ({
      chunk_index: action.act.data.chunk_index,
      chunk_data: action.act.data.chunk_data,
    }));

  return chunks;
}

// Reassemble file from chunks
export async function downloadFile(fileId: number, owner: string) {
  const chunks = await getFileChunks(fileId, owner);

  // Convert base64 chunks to binary and concatenate
  const buffers = chunks.map((chunk: any) =>
    Buffer.from(chunk.chunk_data, 'base64')
  );

  return Buffer.concat(buffers);
}
