export default {
  start(context) {
    context.events.subscribe("message:sent", ({ text }) => {
      context.notifications.show({
        title: "Message envoyé",
        message: text,
        level: "success",
      });
    });
  },
};
