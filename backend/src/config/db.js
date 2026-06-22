import mongoose from "mongoose";

const connectDB = async () => {
  try {
    const connectionInstance = await mongoose.connect(process.env.MONGODB_URI, {
      
    });

    console.log(
      `\nMongoDB Connected Successfully!`
    );
    console.log(
      `   Host: ${connectionInstance.connection.host}`
    );
    console.log(
      `   Database: ${connectionInstance.connection.name}\n`
    );

    // ─── CONNECTION EVENT LISTENERS ──────────────────
    mongoose.connection.on("disconnected", () => {
      console.log("  MongoDB disconnected!");
    });

    mongoose.connection.on("reconnected", () => {
      console.log("MongoDB reconnected!");
    });

    mongoose.connection.on("error", (err) => {
      console.error(" MongoDB connection error:", err);
    });
  } catch (error) {
    console.error(" MongoDB Connection FAILED:", error.message);
    
    process.exit(1);
  }
};

export { connectDB };