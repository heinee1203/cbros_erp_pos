import * as net from "node:net";

export async function sendTcp(
  host: string,
  port: number,
  data: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const client = new net.Socket();
    const timeout = setTimeout(() => {
      client.destroy();
      reject(new Error(`Connection timeout to ${host}:${port}`));
    }, 10_000);

    client.connect(port, host, () => {
      client.write(data, (err) => {
        clearTimeout(timeout);
        if (err) {
          client.destroy();
          reject(err);
        } else {
          client.end(() => resolve());
        }
      });
    });

    client.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}
