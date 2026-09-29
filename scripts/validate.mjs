import { validateLibrary, validatePost } from "./lib.mjs";

const selfTest = process.argv.includes("--self-test");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function runSelfTest() {
  const fields = [{ id: "economics", label: "Economics", agent: "economics-business" }];
  const filler = "This sentence exists so the self-test post meets the minimum length. ".repeat(12);
  const base = {
    id: "self-test-post",
    field: "economics",
    title: "Self test",
    hook: "A hook long enough to pass the minimum length check easily.",
    body: filler,
    deeper: filler,
    example: filler,
    sources: [
      { title: "First source", url: "https://example.org/one" },
      { title: "Second source", url: "https://example.org/two" },
    ],
    authorAgent: "economics-business",
    created: "2026-09-29",
    status: "published",
    review: {
      reviewer: "self-test",
      confidence: 0.9,
      notes: "Notes long enough to satisfy the review notes minimum length.",
      corrections: [],
      unverifiedClaims: [],
      reviewedAt: "2026-09-29",
    },
  };
  assert(validatePost(base, { filename: "self-test-post.json", fields }).length === 0, "valid post should pass");
  assert(validatePost({ ...base, title: "" }, { filename: "self-test-post.json", fields }).length > 0, "empty title should fail");
  const { review, ...draft } = { ...base, status: "draft" };
  assert(validatePost(draft, { filename: "self-test-post.json", fields }).length === 0, "draft without review should pass");
  const published = {
    ...base,
    review: { ...base.review, unverifiedClaims: ["Could not check the source."] },
  };
  assert(
    validatePost(published, { filename: "self-test-post.json", fields }).some((error) => error.includes("unverified")),
    "unverified claims should block publication",
  );
  assert(
    validatePost({ ...base, status: "published", review: undefined }, { filename: "self-test-post.json", fields }).some((error) => error.includes("review")),
    "published posts need a review",
  );
  console.log("Self-test passed.");
}

if (selfTest) {
  runSelfTest();
} else {
  const { errors, publishedCount, postCount } = await validateLibrary();
  if (errors.length) {
    console.error(`Validation failed with ${errors.length} problem${errors.length === 1 ? "" : "s"}:`);
    for (const error of errors) console.error(`- ${error}`);
    process.exit(1);
  }
  console.log(`Validated ${postCount} posts (${publishedCount} published). Feed index matches.`);
}
