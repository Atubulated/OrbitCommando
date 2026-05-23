import { ethers } from "ethers";
import type { VercelRequest, VercelResponse } from "@vercel/node";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Only allow POST requests
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const { playerAddress, score, timeSurvived } = req.body;

    if (!playerAddress || score === undefined) {
      return res.status(400).json({ error: "Missing game data" });
    }

    // --- THE BOUNCER (Sanity Check) ---
    // Example: If they somehow got 50,000 points in 3 seconds, reject it.
    // Adjust this math based on your game's actual max possible score rate!
    const maxScorePerSecond = 500; 
    if (timeSurvived > 0 && (score / timeSurvived) > maxScorePerSecond) {
      return res.status(403).json({ error: "Cheater detected: Score mathematically impossible." });
    }

    // --- THE CRYPTOGRAPHIC SIGNATURE ---
    // We grab the private key from Vercel's secure environment variables
    const privateKey = process.env.BACKEND_SIGNER_PRIVATE_KEY;
    if (!privateKey) {
      throw new Error("Missing backend private key in server environment");
    }

    // Load the Backend Wallet
    const wallet = new ethers.Wallet(privateKey);

    // Recreate the exact hash that the Solidity contract will be looking for
    const messageHash = ethers.solidityPackedKeccak256(
      ["address", "uint256"],
      [playerAddress, score]
    );

    // Sign the hash (ethers.getBytes ensures it signs the raw binary, not a string)
    const signature = await wallet.signMessage(ethers.getBytes(messageHash));

    // Send the signature back to the React frontend!
    return res.status(200).json({ signature });

  } catch (error) {
    console.error("Signature Error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}