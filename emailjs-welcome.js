/**
 * Sends Kigazine welcome emails through EmailJS Browser SDK v4.
 * The identifiers below are public client-side EmailJS identifiers.
 */
(() => {
  "use strict";

  const config = Object.freeze({
    publicKey: "SbnXUZanVcO4LdnHt",
    serviceId: "service_w577rrr",
    templateId: "template_c02cnw3",
    websiteUrl: "https://kigazine.com"
  });

  let initialized = false;

  function getEmailJsClient() {
    if (!window.emailjs) {
      throw new Error("EmailJS Browser SDK did not load.");
    }

    if (!initialized) {
      window.emailjs.init({
        publicKey: config.publicKey,
        blockHeadless: true,
        limitRate: {
          id: "kigazine-welcome-email",
          throttle: 10000
        }
      });
      initialized = true;
    }

    return window.emailjs;
  }

  async function send({ email, username }) {
    const recipientEmail = String(email || "").trim();
    const recipientName = String(username || "").trim() || "Kigazine Creator";

    if (!recipientEmail) {
      throw new Error("A recipient email is required.");
    }

    return getEmailJsClient().send(
      config.serviceId,
      config.templateId,
      {
        to_email: recipientEmail,
        to_name: recipientName,
        website_url: config.websiteUrl
      }
    );
  }

  window.KigazineWelcomeEmail = Object.freeze({ send });
})();
