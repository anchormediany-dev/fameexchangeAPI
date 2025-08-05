import nodemailer from "nodemailer";

export const sendMail = async (to, subject, html) => {
  const transporter = nodemailer.createTransport({
    service: "gmail", // or your provider
    auth: {
      user: process.env.NODEMAILER_EMAIL,
      pass: process.env.NODEMAILER_PASSCODE,
    },
  });

  await transporter.sendMail({
    from: process.env.NODEMAILER_EMAIL,
    to,
    subject,
    html,
  });
};
