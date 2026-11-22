# One-time customers: their own server

Subscription customers run on the main SmartPos Supabase project. A customer who
**buys SmartPos once** gets their own free Supabase project instead, so their use
never counts against yours. They still use the same app and website, and get every
app update.

## Set up a new one-time customer (about 15 minutes)

1. **The customer creates a free Supabase account** at supabase.com (their own email).
2. **They create a project** (Free plan; pick the region closest to the restaurant,
   for example Singapore). They keep the database password themselves.
3. **They invite you** to their organization: Organization settings → Team →
   Invite → your Supabase email, role **Administrator**.
4. **You accept the invite**, then on your computer, in the SmartPos folder, run:

   ```bash
   node scripts/customer.mjs <project-ref>
   ```

   `<project-ref>` is the 20-letter id in their project's address
   (`https://supabase.com/dashboard/project/<project-ref>`). The script sets up the
   database, asks for the restaurant name, branch email and branch password, and
   prints a **setup code**. Send the setup code to the customer.
5. **Turn off public sign-ups** in their project: Authentication → Sign In / Providers →
   switch off **Allow new users to sign up**.
6. **On every device** (the app on each tablet, and the website on the owner's
   computer): on the sign-in screen tap **"Bought SmartPos once? Connect to your own
   server"**, paste the setup code, tap **Connect**, then sign in with the branch
   email and password.

## Updates

App and website updates reach one-time customers automatically, like everyone else.
When an update also changes the database, run the same command again for each
one-time customer; it only applies what is new:

```bash
node scripts/customer.mjs <project-ref>
```

## Good to know

- **Free plan limits are theirs:** 500 MB database and the free bandwidth, plenty for
  one restaurant for years. If they ever outgrow it, they upgrade and pay Supabase
  themselves.
- **A free project pauses after a week without use.** A restaurant open every day
  won't hit it; after a long closure the owner presses **Restore** in the dashboard.
- **Their data is theirs.** Your super-admin panel, contracts and suspension only
  cover restaurants on the main project, so a one-time customer can't be switched off.
- **Not set up on their project:** the pickup "order ready" email. It needs an email
  function and password deployed to their project.
- **The setup code holds only the public project address and public key.** Never
  send anyone the service-role key; the script uses it on your computer and never
  saves it.
- **To move a device back** to the main SmartPos server, tap **"use the SmartPos
  server"** under the sign-in form.
