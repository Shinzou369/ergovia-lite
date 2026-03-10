
const sqlite3 = require('sqlite3').verbose();

// Script to associate gabrielmarius2077@gmail.com with Happy Paws Vet Clinic deployment
function associateClientWithEmail() {
  const etfDB = new sqlite3.Database('etf_data.db');

  // First, check if Happy Paws client exists
  etfDB.get(
    `SELECT * FROM etf_clients WHERE name LIKE '%Happy%Paws%' OR name LIKE '%Happy Paws%'`,
    (err, client) => {
      if (err) {
        console.error('Error finding client:', err);
        etfDB.close();
        return;
      }

      if (client) {
        console.log('Found existing Happy Paws client:', client);
        
        // Update the email to associate with gabrielmarius2077@gmail.com
        etfDB.run(
          `UPDATE etf_clients SET email = ? WHERE id = ?`,
          ['gabrielmarius2077@gmail.com', client.id],
          function(updateErr) {
            if (updateErr) {
              console.error('Error updating client email:', updateErr);
            } else {
              console.log('✅ Successfully associated gabrielmarius2077@gmail.com with Happy Paws Vet Clinic');
              
              // Add a history entry for this association
              etfDB.run(
                `INSERT INTO etf_client_history (client_id, action, details, timestamp)
                 VALUES (?, ?, ?, ?)`,
                [
                  client.id,
                  'Email Association',
                  'Associated client with gabrielmarius2077@gmail.com for control panel access',
                  new Date().toISOString()
                ],
                (historyErr) => {
                  if (historyErr) {
                    console.warn('Warning: Could not log history entry:', historyErr);
                  } else {
                    console.log('✅ History entry added');
                  }
                  etfDB.close();
                }
              );
            }
          }
        );
      } else {
        console.log('❌ No Happy Paws client found. Please deploy Happy Paws first using ETF onboarding.');
        etfDB.close();
      }
    }
  );
}

// Run the association
if (require.main === module) {
  console.log('🔗 Associating gabrielmarius2077@gmail.com with Happy Paws Vet Clinic...');
  associateClientWithEmail();
}

module.exports = associateClientWithEmail;
