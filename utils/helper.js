import nodemailer from "nodemailer";

const sendEmail = async (to, type, otp) => {
  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.NODEMAILER_EMAIL,
        pass: process.env.NODEMAILER_PASSCODE,
      },
    });

    let subject = "";
    let html = "";

    if (type === "otp") {
      subject = "Your OTP Code ";
      html = `
        <p>Hi there,</p>
        <p>Your OTP code for sign up is:</p>
        <h2>${otp}</h2>
        <p>This code will expire in a few minutes. Please do not share it with anyone.</p>
        <p>Thanks,<br/>Your App Team</p>
      `;
    } else if (type === "resetlink") {
      subject = "Reset Your Password";
      html = `
        <p>Hello,</p>
        <p>We received a request to  reset password. here's below the otp code :</p>
         <h2>${otp}</h2>
        <p>This link will expire in 1 hour.</p>
        <p>If you didn't request a password reset, please ignore this email.</p>
        <p>Best,<br/>Your App Team</p>
      `;
    } else {
      console.error("Invalid email type:", type);
      return false;
    }

    const mailOptions = {
      from: `"elementTrade" <paknight1786m@gmail.com>`,
      to,
      subject,
      html,
    };

    await transporter.sendMail(mailOptions);
    console.log(`Mail sent to the provided email : ${to}`);
    return true;
  } catch (error) {
    console.error("Error sending email:", error.message);
    return false;
  }
};

export function parseCount(text) {
  if (!text) return 0;

  // Handle cases like "1.23M subscribers"
  const cleanText = text.replace(/[^0-9.KMB]/g, "").trim();

  const num = parseFloat(cleanText.replace(/[^0-9.]/g, ""));
  if (isNaN(num)) return 0;

  if (cleanText.includes("K")) return Math.round(num * 1000);
  if (cleanText.includes("M")) return Math.round(num * 1000000);
  if (cleanText.includes("B")) return Math.round(num * 1000000000);

  return num;
}

export function extractUsername(url) {
  try {
    const parsed = new URL(url);
    const pathParts = parsed.pathname.split("/").filter(Boolean);
    return pathParts[pathParts.length - 1].replace("@", "");
  } catch {
    return url.split("/").filter(Boolean).pop().replace("@", "");
  }
}

export default sendEmail;
