// This file can be replaced during build by using the `fileReplacements` array.
// `ng build` replaces `environment.ts` with `environment.prod.ts`.
// The list of file replacements can be found in `angular.json`.

export const environment = {
  production: false,
  supabase: {
    url: 'https://hpqwzclyjrfivcmkzwpo.supabase.co', // Replace with your Supabase project URL
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhwcXd6Y2x5anJmaXZjbWt6d3BvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA2ODMzMjUsImV4cCI6MjA3NjI1OTMyNX0.pN-NPncmQCJoiBlYnFk77bAdxXEu5NAn3Fi8bk_c4wI' // Replace with your Supabase anon key
  }
};

/*
 * For easier debugging in development mode, you can import the following file
 * to ignore zone related error stack frames such as `zone.run`, `zoneDelegate.invokeTask`.
 *
 * This import should be commented out in production mode because it will have a negative impact
 * on performance if an error is thrown.
 */
// import 'zone.js/plugins/zone-error';  // Included with Angular CLI.