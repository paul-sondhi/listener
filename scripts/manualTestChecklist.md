# Manual Testing Checklist for Episode Sync Feature

## ✅ Completed Automated Checks
- [x] Database schema verification
- [x] RSS URL backfill (68/68 shows)
- [x] Episode sync service functionality
- [x] Background jobs integration (19/19 tests passing)
- [x] Unit test coverage (15/15 tests passing)

## 🧪 Manual Tests You Should Run

### 1. **Environment Variables Check**
```bash
# In your production environment, verify these are set:
echo $EPISODE_SYNC_ENABLED
echo $EPISODE_SYNC_CRON
echo $PODCASTINDEX_KEY
echo $SPOTIFY_CLIENT_ID
```

### 2. **Background Job Manual Trigger**
```bash
# Test the background job manually in your server environment
cd packages/server
npm run test:jobs  # Should show episode sync job is scheduled
```

### 3. **RSS Feed Accessibility Test**
Pick 3-5 shows from your database and manually verify their RSS URLs are accessible:
```bash
curl -I "https://feeds.megaphone.fm/VMP5489734702"  # Should return 200 OK
curl -I "https://talktherapypod.libsyn.com/rss"     # Should return 200 OK
```

### 4. **Date Filter Verification**
The episode sync only processes episodes published after **2025-06-15**. Since this is in the future, most shows will return 0 episodes (which is expected and correct).

To test with actual episodes, you could:
- Temporarily modify the cutoff date in `episodeSyncService.ts` to `2024-06-15`
- Run a test sync
- Change it back to `2025-06-15`

### 5. **Production Database Permissions**
Verify the service role can:
- Read from `podcast_shows`
- Insert/update `podcast_episodes`
- Update `last_checked_episodes` timestamps

### 6. **Error Handling Test**
Try syncing a show with an invalid RSS URL to verify error handling:
```sql
-- Temporarily update a show with bad RSS URL
UPDATE podcast_shows SET rss_url = 'https://invalid-url.com/feed' WHERE id = 'some-show-id';
-- Run sync (should handle gracefully)
-- Restore original RSS URL
```

### 7. **Performance Check**
Monitor sync performance for multiple shows:
- Check memory usage during sync
- Verify sync completes within reasonable time
- Ensure no memory leaks

### 8. **Cron Job Scheduling**
If `EPISODE_SYNC_ENABLED=true`:
- Verify the cron job is scheduled for midnight PST
- Check server timezone settings
- Ensure job doesn't conflict with other scheduled tasks

## 🚨 Critical Production Checks

### Before Going Live:
1. **Set Environment Variables**:
   ```bash
   EPISODE_SYNC_ENABLED=true
   EPISODE_SYNC_CRON="0 0 * * *"  # Midnight PST
   ```

2. **Monitor First Run**:
   - Watch server logs during first scheduled run
   - Check database for episode insertions
   - Verify `last_checked_episodes` updates

3. **Rollback Plan**:
   - Know how to disable: `EPISODE_SYNC_ENABLED=false`
   - Have database backup ready
   - Monitor for any performance issues

## ✅ Success Criteria
- [ ] All RSS URLs return valid feeds (or expected 404s for inactive shows)
- [ ] Episode sync runs without errors
- [ ] `last_checked_episodes` timestamps update correctly
- [ ] No memory leaks or performance degradation
- [ ] Cron job schedules properly
- [ ] Error handling works for invalid feeds
- [ ] Date filtering works correctly (2025-06-15 cutoff)

## 🎯 Ready for Production When:
- All manual tests pass
- Environment variables configured
- Monitoring/alerting in place
- Team knows how to disable if needed 