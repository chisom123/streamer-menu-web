# Streamer Menu Web

Web-based order form for live streamers to share with viewers ahead of a stream. Friends can browse and pay for request items before the stream starts, reducing friction and increasing engagement.

---

## 📱 Overview

This web app is the companion to the live streaming iOS app. Streamers share a link to their menu, viewers browse available request options, add items to their cart, and pay in advance—so when the stream starts, the streamer already knows what requests to fulfil.

---

## 🛠️ Tech Stack

- **React** – Frontend
- **Firebase** – Auth, Firestore, Cloud Functions
- **Stripe** – Payment processing

---

## ✨ Key Features

- **Menu browsing** – View all available request items for a streamer
- **Cart management** – Add/remove items and see running total
- **Checkout** – Enter name and phone number, then pay via Stripe
- **Pre-stream ordering** – Viewers can place orders before the stream starts
- **Live status** – Shows when the streamer is currently live

---

## 🏗️ Architecture

Built on a **Firebase-first** backend:

- **Firestore** – Stores menu items, orders, and streamer profiles
- **Cloud Functions** – Serverless logic for order creation and payment processing
- **Stripe** – Handles payment processing and checkout sessions

---

## 📸 Screenshots

| Menu View | Cart |
|-----------|------|
| <img width="300" alt="Menu View" src="https://github.com/user-attachments/assets/3a1c8784-9c82-428e-821c-65243c794e9f" /> | <img width="300" alt="Cart" src="https://github.com/user-attachments/assets/3d79012f-8245-4e80-8f89-2500e9ebc939" /> |

---

## 🔗 Related Repos

- [Live Streaming iOS App](https://github.com/chisom123/live-streaming-ios) – The main app where streamers go live and receive requests

---

## ⚙️ Setup

This project uses Firebase. To run it locally:

1. Clone the repo  
2. Create a Firebase project and enable Auth, Firestore, and Cloud Functions  
3. Add your Firebase config to the environment variables  
4. Run `npm install` and `npm start`

---

## 📈 Evolution

Built to solve a specific friction point—friends sending requests during a stream can be chaotic and interrupt the flow. This web menu lets viewers order ahead of time, so the streamer can focus on performing while knowing what requests are coming in.
