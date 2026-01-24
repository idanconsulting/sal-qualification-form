/**
 * Test Data Generator for SAL Form
 *
 * Use this to generate test tokens for local development
 *
 * Usage:
 *   node test-data-generator.js
 *
 * Then copy the generated URL and use it in your browser
 */

const testData = {
  contactId: '12345',
  contactName: 'John Smith',
  contactEmail: 'john.smith@example.com',
  companyName: 'Acme Corporation',
  companySize: '50-200',
  industry: 'Technology',
  aeName: 'Sarah Johnson',
  aeEmail: 'sarah.johnson@reindeer.ai',
  sdrName: 'Mike Davis',
  sdrOwnerId: '67890',
  meetingDate: new Date().toLocaleDateString(),
  source: 'Organic Search',
  meetingId: 'meeting_123'
};

// Generate base64 token
const token = Buffer.from(JSON.stringify(testData)).toString('base64');

// Generate test URLs
const localUrl = `http://localhost:3000?token=${token}`;
const deployedUrl = `https://your-form.vercel.app?token=${token}`;

console.log('\n=== SAL Form Test Data Generator ===\n');
console.log('Test Data:');
console.log(JSON.stringify(testData, null, 2));
console.log('\n---\n');
console.log('Generated Token:');
console.log(token);
console.log('\n---\n');
console.log('Local Development URL:');
console.log(localUrl);
console.log('\n---\n');
console.log('Production URL (update domain):');
console.log(deployedUrl);
console.log('\n---\n');

// Also create variations for different test scenarios
const testScenarios = [
  {
    name: 'Small Company - Early Stage',
    data: {
      ...testData,
      companyName: 'Startup Inc',
      companySize: '1-10',
      source: 'Cold Outreach'
    }
  },
  {
    name: 'Large Enterprise',
    data: {
      ...testData,
      companyName: 'Global Enterprises Ltd',
      companySize: '1000+',
      source: 'Referral'
    }
  },
  {
    name: 'Missing AE (should default)',
    data: {
      ...testData,
      aeName: 'Unknown',
      aeEmail: null
    }
  }
];

console.log('Additional Test Scenarios:\n');
testScenarios.forEach((scenario, index) => {
  const scenarioToken = Buffer.from(JSON.stringify(scenario.data)).toString('base64');
  console.log(`${index + 1}. ${scenario.name}`);
  console.log(`   URL: http://localhost:3000?token=${scenarioToken}`);
  console.log('');
});

// Export function for use in other scripts
module.exports = {
  generateToken: (data) => {
    return Buffer.from(JSON.stringify(data)).toString('base64');
  },
  generateUrl: (data, baseUrl = 'http://localhost:3000') => {
    const token = Buffer.from(JSON.stringify(data)).toString('base64');
    return `${baseUrl}?token=${token}`;
  },
  testData
};
