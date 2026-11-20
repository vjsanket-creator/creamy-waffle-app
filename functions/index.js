const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");

initializeApp();

const db = getFirestore();
const messaging = getMessaging();

exports.sendCustomerShopStatusPush = onDocumentCreated(
  "customer_notifications/{notifId}",
  async (event) => {
    const snap = event.data;
    if (!snap) return;

    const notifData = snap.data() || {};
    if (notifData.targetRole && notifData.targetRole !== "customer") {
      return;
    }

    const isOpenNow = notifData.shopStatus === "open";
    const title =
      notifData.title ||
      (isOpenNow
        ? "Creamy Waffle - Shop is Open!"
        : "Creamy Waffle - Shop is Closed");
    const body =
      notifData.message ||
      notifData.body ||
      (isOpenNow
        ? "Now Shop is Open! You can start ordering."
        : "Now Shop is Closed! Ordering is temporarily disabled.");

    const tokensSnapshot = await db.collection("customer_push_tokens").get();
    if (tokensSnapshot.empty) {
      return;
    }

    const tokenDocMap = new Map();
    tokensSnapshot.forEach((doc) => {
      const data = doc.data() || {};
      const token = (data.token || doc.id || "").trim();
      if (token) {
        tokenDocMap.set(token, doc.ref);
      }
    });

    const tokens = Array.from(tokenDocMap.keys());
    if (tokens.length === 0) {
      return;
    }

    const chunkSize = 500;
    for (let i = 0; i < tokens.length; i += chunkSize) {
      const batchTokens = tokens.slice(i, i + chunkSize);

      const response = await messaging.sendEachForMulticast({
        tokens: batchTokens,
        notification: {
          title: title,
          body: body,
        },
        data: {
          shopStatus: isOpenNow ? "open" : "closed",
          title: title,
          body: body,
          url: "./index.html",
        },
        webpush: {
          notification: {
            title: title,
            body: body,
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
            body: body,
            sound: "default",
          },
        },
      });

      const cleanupPromises = [];
      response.responses.forEach((res, idx) => {
        if (!res.success && res.error) {
          const code = res.error.code;
          if (
            code === "messaging/registration-token-not-registered" ||
            code === "messaging/invalid-registration-token"
          ) {
            const badToken = batchTokens[idx];
            const ref = tokenDocMap.get(badToken);
            if (ref) {
              cleanupPromises.push(ref.delete().catch(() => {}));
            }
          }
        }
      });

      if (cleanupPromises.length > 0) {
        await Promise.all(cleanupPromises);
      }
    }
  }
);