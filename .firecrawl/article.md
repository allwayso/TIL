# [Simon Willison’s Weblog](https://simonwillison.net/)

[Subscribe](https://simonwillison.net/about/#subscribe)

**Sponsored by:** AWS — Move from SaaS to Agentic SaaS with resources for ISVs at every layer of the stack. [Explore how AI for ISVs turns vision into results](https://fandf.co/4yrcF3h)

## Building a self-updating profile README for GitHub

10th July 2020

GitHub quietly released a new feature at some point in the past few days: profile READMEs. Create a repository with the same name as your GitHub account (in my case that’s [github.com/simonw/simonw](https://github.com/simonw/simonw)), add a `README.md` to it and GitHub will render the contents at the top of your personal profile page—for me that’s [github.com/simonw](https://github.com/simonw)

I couldn’t resist re-using the trick [from this blog post](https://simonwillison.net/2020/Apr/20/self-rewriting-readme/) and implementing a GitHub Action to automatically keep my profile README up-to-date.

Visit [github.com/simonw](https://github.com/simonw) and you’ll see a three-column README showing my latest GitHub project releases, my latest blog entries and my latest [TILs](https://til.simonwillison.net/).

![My GitHub profile](https://static.simonwillison.net/static/2020/simonw-github.png)

I’m doing this with a GitHub Action in [build.yml](https://github.com/simonw/simonw/blob/master/.github/workflows/build.yml). It’s configured to run on every push to the repo, on a schedule at 32 minutes past the hour and on the new `workflow_dispatch` event which means I get a [manual button I can click](https://github.blog/changelog/2020-07-06-github-actions-manual-triggers-with-workflow_dispatch/) to trigger it on demand.

The Action runs a Python script called [build\_readme.py](https://github.com/simonw/simonw/blob/master/build_readme.py) which does the following:

- Hits the GitHub GraphQL API to retrieve the latest release for every one of my 300+ repositories
- Hits my blog’s [full entries Atom feed](https://simonwillison.net/atom/entries/) to retrieve the most recent posts (using the [feedparser](https://pypi.org/project/feedparser/) Python library)
- Hits my TILs website’s Datasette API running [this SQL query](https://til.simonwillison.net/til?sql=select+title%2C+url%2C+created_utc+from+til+order+by+created_utc+desc+limit+5) to return the latest TIL links

It then turns the results from those various sources into a markdown list of links and replaces commented blocks in the README that look like this:

```
<!-- recent_releases starts -->
...
<!-- recent_releases ends -->
```

The whole script is [less than 150 lines of Python](https://github.com/simonw/simonw/blob/master/build_readme.py).

#### GitHub GraphQL

I have a bunch of experience working with GitHub’s regular REST APIs, but for this project I decided to go with their newer [GraphQL API](https://developer.github.com/v4/).

I wanted to show the most recent “releases” for all of my projects. I have over 300 GitHub repositories now, and only a portion of them use the releases feature.

Using REST, I would have to make over 300 API calls to figure out which ones have releases.

With GraphQL, I can do this instead:

```
query {
  viewer {
    repositories(first: 100, privacy: PUBLIC) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        name
        releases(last:1) {
          totalCount
          nodes {
            name
            publishedAt
            url
          }
        }
      }
    }
  }
}
```

This query returns the most recent release (`last:1`) for each of the first 100 of my public repositories.

You can paste it into the [GitHub GraphQL explorer](https://developer.github.com/v4/explorer/) to run it against your own profile.

There’s just one catch: pagination. I have more than 100 repos but their GraphQL can only return 100 nodes at a time.

To paginate, you need to request the `endCursor` and then pass that as the `after:` parameter for the next request. I wrote up how to do this in [this TIL](https://github.com/simonw/til/blob/master/github/graphql-pagination-python.md).

#### Next steps

I’m pretty happy with this as a first attempt at automating my profile. There’s something extremely satsifying about having a GitHub profile that self-updates itself using GitHub Actions—it feels appropriate.

There’s so much more stuff I could add to this: my tweets, my sidebar blog links, maybe even download statistics from PyPI. I’ll see what takes my fancy in the future.

I’m not sure if there’s a size limit on the README that is displayed on the profile page, so deciding how much information is appropriate is appears to be mainly a case of personal taste.

Building these automated profile pages is pretty easy, so I’m looking forward to seeing what kind of things other nerds come up with!

Posted [10th July 2020](https://simonwillison.net/2020/Jul/10/) at 4:41 am · Follow me on [Mastodon](https://fedi.simonwillison.net/@simon), [Bluesky](https://bsky.app/profile/simonwillison.net), [Twitter](https://twitter.com/simonw) or [subscribe to my newsletter](https://simonwillison.net/about/#subscribe)

## More recent articles

- [New release of LLM adds support for reasoning traces, OpenAI Responses, server-side tools, and smarter logging](https://simonwillison.net/2026/Aug/4/new-release-of-llm/) \- 4th August 2026
- [Stateless MCP has recaptured my interest (and inspired mcp-explorer and datasette-mcp)](https://simonwillison.net/2026/Jul/31/stateless-mcp/) \- 31st July 2026
- [OpenAI’s accidental cyberattack against Hugging Face is science fiction that happened](https://simonwillison.net/2026/Jul/22/openai-cyberattack/) \- 22nd July 2026

This is **Building a self-updating profile README for GitHub** by Simon Willison, posted on [10th July 2020](https://simonwillison.net/2020/Jul/10/).

[github\\
191](https://simonwillison.net/tags/github/) [projects\\
551](https://simonwillison.net/tags/projects/) [graphql\\
21](https://simonwillison.net/tags/graphql/) [github-actions\\
68](https://simonwillison.net/tags/github-actions/)

**Next:** [Weeknotes: datasette-auth-passwords, a Datasette logo and a whole lot more](https://simonwillison.net/2020/Jul/17/weeknotes-datasette-logo/)

**Previous:** [Weeknotes: SBA Covid-19 PPP loans, Datasette talks, Datasette plugin upgrades](https://simonwillison.net/2020/Jul/9/sba-covid-19-ppp-loans/)

### Monthly briefing

Sponsor me for **$10/month** and get a curated email digest of the month's most important LLM developments.


Pay me to send you less!


[Sponsor & subscribe](https://github.com/sponsors/simonw/)

Twitter Embed

> Wrote this up on my blog: Building a self-updating profile README for GitHub [https://t.co/M4epbZxdKa](https://t.co/M4epbZxdKa)
>
> — Simon Willison (@simonw) [July 10, 2020](https://twitter.com/simonw/status/1281448821914923009?ref_src=twsrc%5Etfw)

- [Disclosures](https://simonwillison.net/about/#disclosures)
- [Colophon](https://simonwillison.net/about/#about-site)
- ©
- [2002](https://simonwillison.net/2002/)
- [2003](https://simonwillison.net/2003/)
- [2004](https://simonwillison.net/2004/)
- [2005](https://simonwillison.net/2005/)
- [2006](https://simonwillison.net/2006/)
- [2007](https://simonwillison.net/2007/)
- [2008](https://simonwillison.net/2008/)
- [2009](https://simonwillison.net/2009/)
- [2010](https://simonwillison.net/2010/)
- [2011](https://simonwillison.net/2011/)
- [2012](https://simonwillison.net/2012/)
- [2013](https://simonwillison.net/2013/)
- [2014](https://simonwillison.net/2014/)
- [2015](https://simonwillison.net/2015/)
- [2016](https://simonwillison.net/2016/)
- [2017](https://simonwillison.net/2017/)
- [2018](https://simonwillison.net/2018/)
- [2019](https://simonwillison.net/2019/)
- [2020](https://simonwillison.net/2020/)
- [2021](https://simonwillison.net/2021/)
- [2022](https://simonwillison.net/2022/)
- [2023](https://simonwillison.net/2023/)
- [2024](https://simonwillison.net/2024/)
- [2025](https://simonwillison.net/2025/)
- [2026](https://simonwillison.net/2026/)

Twitter Widget Iframe