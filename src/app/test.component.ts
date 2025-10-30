import { Component } from '@angular/core';

@Component({
  selector: 'app-test',
  template: `
    <div>
      <h1>Testing Card Collection Refactoring</h1>
      <p>This is a simple test to verify the refactored card collection works.</p>
      <app-card-collection></app-card-collection>
    </div>
  `
})
export class TestComponent {
}