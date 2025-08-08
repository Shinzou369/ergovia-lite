
const cron = require('node-cron');
const { resetMonthlyUsage } = require('./keyManager');

/**
 * Initialize the monthly reset scheduler
 * Runs on the 1st day of each month at midnight
 */
function initScheduler() {
  // Run every 1st day of the month at 00:00
  cron.schedule('0 0 1 * *', () => {
    console.log('🔄 Running monthly token usage reset...');
    try {
      const resetCount = resetMonthlyUsage();
      console.log(`✅ Monthly reset completed. ${resetCount} clients reset.`);
    } catch (error) {
      console.error('❌ Monthly reset failed:', error);
    }
  }, {
    scheduled: true,
    timezone: "UTC"
  });
  
  console.log('📅 Monthly token reset scheduler initialized');
}

/**
 * Manual reset function for testing
 */
function manualReset() {
  console.log('🔄 Manual token usage reset triggered...');
  try {
    const resetCount = resetMonthlyUsage();
    console.log(`✅ Manual reset completed. ${resetCount} clients reset.`);
    return { success: true, resetCount };
  } catch (error) {
    console.error('❌ Manual reset failed:', error);
    return { success: false, error: error.message };
  }
}

module.exports = {
  initScheduler,
  manualReset
};
