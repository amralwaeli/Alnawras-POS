# One-time customers: their own server

Subscription customers run on the main SmartPos Supabase project. A customer who
**buys SmartPos once** gets their own free Supabase project instead, so their use never
counts against yours. They use the same app and website and get every app update.

## Set up a new one-time customer (about 5 minutes)

1. **The customer creates a free Supabase account** at supabase.com (their own email)
   and **a project** (Free plan; pick the region closest to the restaurant, for example
   Singapore). They keep the database password themselves.
2. **They invite you** to their organization: Organization settings → Team → Invite →
   your Supabase email, role **Administrator**. Accept the invite.
3. **Create an access token** in your own Supabase account: Account → Access Tokens →
   Generate new token. It is only used for this setup; you can delete it afterwards.
4. In the **super-admin panel → Add Tenant**, choose **One-time purchase** and fill in:
   the restaurant name, the branch email, their project URL
   (`https://<project-id>.supabase.co`) and the access token. Press **Set up & license**.
   In about a minute it sets up their database, turns off public sign-ups, creates the
   restaurant and its sign-in (shown once: branch email + temporary password), and
   signs a licence for that project.
5. **Give the restaurant the branch email and temporary password.** On every device
   (the app on each tablet, and the website) they sign in as usual; the app finds their
   server by itself.

## How the licence protects you

- The licence is signed with a private key that only your server has (Edge Function
  secret `LICENSE_PRIVATE_KEY`; a backup is in `E:\freelance\AlnawrasPOS-signing\`,
  never in the repo). Keep that backup safe; without it you can't issue licences after
  a server move.
- The app only runs on a customer server whose licence is genuine and names that exact
  project. Copying the system to another Supabase project gives no licence, so it can't
  be resold. A licensed device keeps working offline.
- One-time customers appear in the super-admin panel under **One-time customers**.

## Updates

App and website updates reach one-time customers automatically. When an update also
changes the database, run this for each one-time customer (it only applies what's new):

```bash
node scripts/customer.mjs <project-ref>
```

When you add a migration, also refresh the copy used for new customers and redeploy:

```bash
node scripts/bundle-migrations.mjs
npx supabase functions deploy setup-onetime-tenant --project-ref uasnihapkcrgibnpqdyi --use-api
```

## Good to know

- **Free plan limits are theirs:** 500 MB database and the free bandwidth, plenty for one
  restaurant for years. If they outgrow it, they upgrade and pay Supabase themselves.
- **A free project pauses after a week without use.** A restaurant open every day won't
  hit it; after a long closure the owner presses **Restore** in their dashboard.
- **Their data is theirs**, and your contract/suspension controls don't reach it.
- **Not set up on their project:** the pickup "order ready" email.
- **The code is public on GitHub**, so a skilled developer could copy it and remove the
  licence check. Hosting the website from a private repository on Cloudflare Pages
  (free) closes that gap.
