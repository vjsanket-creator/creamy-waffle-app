const admin = require("firebase-admin");

if (!admin.apps.length) {
  const serviceAccountRaw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!serviceAccountRaw) {
    throw new Error("Missing FIREBASE_SERVICE_ACCOUNT_JSON environment variable");
  }
  const serviceAccount = JSON.parse(serviceAccountRaw);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();
const messaging = admin.messaging();

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const bodyData =
      typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    const isOpenNow = bodyData.shopStatus === "open";

    const title =
      bodyData.title ||
      (isOpenNow
        ? "Creamy Waffle - Shop is Open!"
        : "Creamy Waffle - Shop is Closed");

    const messageText =
      bodyData.message ||
      bodyData.body ||
      (isOpenNow
        ? "Now Shop is Open! You can start ordering."
        : "Now Shop is Closed! Ordering is temporarily disabled.");

    const tokensSnap = await db.collection("customer_push_tokens").get();
    if (tokensSnap.empty) {
      return res
        .status(200)
        .json({ ok: true, sent: 0, message: "No customer tokens found" });
    }

    const tokenDocMap = new Map();
    tokensSnap.forEach((doc) => {
      const d = doc.data() || {};
      const tok = String(d.token || doc.id || "").trim();
      if (tok) {
        tokenDocMap.set(tok, doc.ref);
      }
    });

    const tokens = Array.from(tokenDocMap.keys());
    if (tokens.length === 0) {
      return res
        .status(200)
        .json({ ok: true, sent: 0, message: "No valid tokens" });
    }

    let successCount = 0;
    let failureCount = 0;

    for (let i = 0; i < tokens.length; i += 500) {
      const batch = tokens.slice(i, i + 500);
      const response = await messaging.sendEachForMulticast({
        tokens: batch,
        notification: {
          title: title,
          body: messageText,
        },
        data: {
          shopStatus: isOpenNow ? "open" : "closed",
          title: title,
          body: messageText,
          url: "./index.html",
        },
        webpush: {
          notification: {
            title: title,
            body: messageText,
            icon: "waffle-logo.png",
            badge: "waffle-logo.png",
            requireInteraction: false,
          },
          fcmOptions: {
            link: "./index.html",
          },
        },
        android: {
          priority: "high",
          notification: {
            title: title,
            body: messageText,
            sound: "default",
          },
        },
      });

      successCount += response.successCount;
      failureCount += response.failureCount;

      const cleanup = [];
      response.responses.forEach((r, idx) => {
        if (!r.success && r.error) {
          const code = r.error.code;
          if (
            code === "messaging/registration-token-not-registered" ||
            code === "messaging/invalid-registration-token"
          ) {
            const ref = tokenDocMap.get(batch[idx]);
            if (ref) cleanup.push(ref.delete().catch(() => {}));
          }
        }
      });
      if (cleanup.length > 0) {
        await Promise.all(cleanup);
      }
    }

    return res.status(200).json({
      ok: true,
      sent: successCount,
      failed: failureCount,
    });
  } catch (err) {
    console.error("send-shop-push error:", err);
    return res
      .status(500)
      .json({ ok: false, error: err.message || "Server error" });
  }
};