import { Hono } from "hono";
import { basicAuth } from "hono/basic-auth";
import { getCookie, setCookie } from "hono/cookie";
import { Fragment } from "hono/jsx/jsx-runtime";

type Bindings = {
  BUCKET: R2Bucket;
  USERNAME: string;
  PASSWORD: string;
};

type Message = {
  sender: Sender;
  message: string;
  timestamp: number;
};

type Sender = {
  name: string;
};

type ChatFile = {
  messages: Message[];
  senders: Sender[];
};

const app = new Hono<{ Bindings: Bindings }>({});

app.use((c, next) => {
  return basicAuth({
    realm: "chat",
    username: c.env.USERNAME,
    password: c.env.PASSWORD,
  })(c, next);
});

app.get("/", async (c) => {
  const chatFile = await c.env.BUCKET.get("chat.json");
  const chat: ChatFile = chatFile
    ? await chatFile.json()
    : { messages: [], senders: [] };

  const sender = getCookie(c, "sender");

  return c.render(
    <div>
      <div>
        参加者:
        {chat.senders?.reverse().map((s) => (
          <span>{s.name} </span>
        ))}
      </div>
      <ul style="max-height: 600px;overflow:auto">
        {chat.messages?.reverse().map((m) => (
          <Fragment>
            <li>
              <span>{m.sender.name + " >>  "}</span>
              <span>{m.message}</span>
              {/** タイムスタンプを日本の形式で出力 */}
              <span style="margin-left: 10px">
                {new Date(m.timestamp).toLocaleString("ja-JP")}
              </span>
            </li>
            <hr></hr>
          </Fragment>
        ))}
      </ul>

      {sender ? (
        <Fragment>
          <form action="/" method="post">
            <input type="text" name="message" autofocus />
            <input type="submit" value="送信 / 更新" />
          </form>
          <form action="/leave" method="get">
            <input type="submit" value="退出" />
          </form>
        </Fragment>
      ) : (
        <form action="/join" method="post">
          <input type="text" name="name" />
          <input type="submit" value="参加" />
        </form>
      )}

      <script
        dangerouslySetInnerHTML={{
          __html: `
          let isInput = false;
          window.setInterval(() => {
            if (!isInput) {
              window.location.reload();
            }
          }, 20000);
          `,
        }}
      ></script>
    </div>
  );
});

app.post("/", async (c) => {
  const chatFile = await c.env.BUCKET.get("chat.json");
  const chat: ChatFile = chatFile
    ? await chatFile.json()
    : { messages: [], senders: [] };

  if (!chat.senders) {
    chat.senders = [];
  }
  if (!chat.messages) {
    chat.messages = [];
  }

  const sender = getCookie(c, "sender");
  if (!sender) {
    return c.redirect("/");
  }

  const body = await c.req.parseBody();
  const message = body.message as string;
  if (!message) {
    return c.redirect("/");
  }
  const timestamp = Date.now();
  chat.messages.push({ sender: { name: sender }, message, timestamp });

  await c.env.BUCKET.put("chat.json", JSON.stringify(chat));

  return c.redirect("/");
});

app.post("/join", async (c) => {
  const chatFile = await c.env.BUCKET.get("chat.json");
  const chat: ChatFile = chatFile
    ? await chatFile.json()
    : { messages: [], senders: [] };

  const body = await c.req.parseBody();
  const name = body.name as string;
  const sender: Sender = { name };
  if (!name) {
    return c.redirect("/");
  }

  if (!chat.senders) {
    chat.senders = [];
  }
  if (!chat.messages) {
    chat.messages = [];
  }

  chat.senders.push(sender);
  chat.messages.push({
    sender: { name: "管理人" },
    message: `${name}さんが参加しました`,
    timestamp: Date.now(),
  });

  setCookie(c, "sender", name);

  await c.env.BUCKET.put("chat.json", JSON.stringify(chat));

  return c.redirect("/");
});

app.get("/leave", async (c) => {
  const chatFile = await c.env.BUCKET.get("chat.json");
  const chat: ChatFile = chatFile
    ? await chatFile.json()
    : { messages: [], senders: [] };

  const sender = getCookie(c, "sender");
  if (!sender) {
    return c.redirect("/");
  }

  chat.messages.push({
    sender: { name: "管理人" },
    message: `${sender}さんが退出しました`,
    timestamp: Date.now(),
  });

  chat.senders = chat.senders.filter((s) => s.name !== sender);

  await c.env.BUCKET.put("chat.json", JSON.stringify(chat));

  setCookie(c, "sender", "");

  return c.redirect("/");
});

export default app;
