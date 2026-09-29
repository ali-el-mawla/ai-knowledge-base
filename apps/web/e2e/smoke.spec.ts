import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';

/**
 * One pass through the product as a new user: sign up, add a document holding a fact no model
 * can know, wait until it is indexed, ask the chat about it, open the cited passage, delete
 * the document. Runs against the real stack (Supabase, the embedding and chat models).
 */

const TITLE = 'Zephyr project brief';
const FACT = 'The Zephyr project code is ZP-4471 and its budget is 38,000 USD.';
const QUESTION = 'What is the budget of the Zephyr project?';

test('a new user adds a document, asks the chat about it and opens the cited passage', async ({
  page,
}) => {
  // A fresh account per run. RLS hides everyone else's documents, so the only passage the
  // chat can retrieve and cite is the one this test creates.
  const email = `e2e-${randomUUID()}@example.test`;
  const password = `pw-${randomUUID()}`;
  const answer = page.getByRole('article', { name: 'Answer' });
  // The docked source panel is a section labelled by its heading ("1 Zephyr project brief").
  const sourcePanel = page.getByRole('region', { name: TITLE });

  await test.step('sign up', async () => {
    await page.goto('/signup');
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page).toHaveURL(/\/documents$/);
  });

  const documentUrl =
    await test.step('create a document and wait until it is indexed', async () => {
      // The header button (a new account also shows one in its empty state).
      await page.getByRole('link', { name: 'New document' }).first().click();
      await page.getByLabel('Title', { exact: true }).fill(TITLE);
      await page.getByLabel('Content', { exact: true }).fill(`# Zephyr project\n\n${FACT}\n`);
      await page.getByRole('button', { name: 'Create document' }).click();
      await expect(page).toHaveURL(/\/documents\/[0-9a-f-]{36}$/);
      // The badge moves from Queued to Indexing to "Ready, 1 chunk" once the chunks are embedded.
      await expect(page.getByText(/^Ready, \d+ chunks?$/)).toBeVisible({ timeout: 60_000 });
      return page.url();
    });

  await test.step('ask the chat about the fact', async () => {
    await page.getByRole('link', { name: 'Chat', exact: true }).click();
    await page.getByLabel('Message', { exact: true }).fill(QUESTION);
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    // The copy button appears once the streamed answer is complete and saved.
    await expect(answer.getByRole('button', { name: 'Copy answer' })).toBeVisible({
      timeout: 60_000,
    });
    await expect(answer).toContainText('38,000');
  });

  await test.step('open the cited passage', async () => {
    await answer
      .getByRole('button', { name: new RegExp(`^Source \\d+: ${TITLE}`) })
      .first()
      .click();
    await expect(sourcePanel).toContainText(FACT);
  });

  await test.step('delete the document', async () => {
    await sourcePanel.getByRole('link', { name: 'Open document' }).click();
    await expect(page).toHaveURL(documentUrl);
    await page.getByRole('button', { name: 'Delete document' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Delete document' }).click();
    await expect(page).toHaveURL(/\/documents$/);
    await expect(page.getByText('No documents yet')).toBeVisible();
  });
});
