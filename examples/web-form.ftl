<#-- Web Form Template with Spring Boot Integration -->

<#import "/spring.ftl" as spring/>
<#include "common/form-helpers.ftl"/>

<#assign formTitle = "User Registration Form"/>
<#assign currentStep = step!1/>
<#assign maxSteps = 3/>

<#-- Form validation function -->
<#function hasErrors field>
  <#return spring.status.error?? && spring.status.errorCode??>
</#function>

<#-- Progress indicator macro -->
<#macro progressIndicator current max>
  <div class="progress-bar">
    <#list 1..max as step>
      <div class="step ${(step <= current)?string('completed', (step == current)?string('current', 'pending'))}">
        <span class="step-number">${step}</span>
        <span class="step-title">
          <#switch step>
            <#case 1>Personal Info<#break>
            <#case 2>Contact Details<#break>
            <#case 3>Preferences<#break>
            <#default>Step ${step}
          </#switch>
        </span>
      </div>
    </#list>
  </div>
</#macro>

<#-- Form field macro with validation -->
<#macro formField fieldName label type="text" required=false options=[]>
  <@spring.bind "user.${fieldName}"/>
  <div class="form-group ${spring.status.error?string('has-error', '')}">
    <label for="${fieldName}" class="${required?string('required', '')}">
      ${label}
      <#if required><span class="required-marker">*</span></#if>
    </label>
    
    <#switch type>
      <#case "select">
        <select id="${fieldName}" name="${fieldName}" class="form-control">
          <option value="">-- Select ${label} --</option>
          <#list options as option>
            <option value="${option.value}" 
                    ${(spring.status.value! == option.value)?string('selected', '')}>
              ${option.label}
            </option>
          </#list>
        </select>
        <#break>
      
      <#case "textarea">
        <textarea id="${fieldName}" name="${fieldName}" 
                  class="form-control" rows="4"
                  placeholder="Enter ${label?lower_case}">${spring.status.value!}</textarea>
        <#break>
      
      <#case "checkbox">
        <div class="checkbox-group">
          <#list options as option>
            <label class="checkbox-label">
              <input type="checkbox" name="${fieldName}" value="${option.value}"
                     ${spring.status.value?seq_contains(option.value)?string('checked', '')}>
              ${option.label}
            </label>
          </#list>
        </div>
        <#break>
      
      <#case "radio">
        <div class="radio-group">
          <#list options as option>
            <label class="radio-label">
              <input type="radio" name="${fieldName}" value="${option.value}"
                     ${(spring.status.value! == option.value)?string('checked', '')}>
              ${option.label}
            </label>
          </#list>
        </div>
        <#break>
      
      <#default>
        <input type="${type}" id="${fieldName}" name="${fieldName}" 
               class="form-control" value="${spring.status.value!}"
               placeholder="Enter ${label?lower_case}"
               ${required?string('required', '')}>
    </#switch>
    
    <#if spring.status.error>
      <div class="error-message">
        <#list spring.status.errorMessages as error>
          <span class="error-text">${error}</span>
        </#list>
      </div>
    </#if>
  </div>
</#macro>

<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${formTitle}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
    .container { max-width: 800px; margin: 0 auto; background: white; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
    .form-header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 10px 10px 0 0; }
    .form-body { padding: 30px; }
    .progress-bar { display: flex; justify-content: space-between; margin-bottom: 30px; }
    .step { text-align: center; flex: 1; position: relative; }
    .step-number { display: inline-block; width: 40px; height: 40px; line-height: 40px; border-radius: 50%; background: #ddd; color: #666; font-weight: bold; }
    .step.current .step-number { background: #667eea; color: white; }
    .step.completed .step-number { background: #28a745; color: white; }
    .step-title { display: block; margin-top: 10px; font-size: 14px; }
    .form-group { margin-bottom: 25px; }
    .form-group.has-error .form-control { border-color: #dc3545; }
    label { display: block; margin-bottom: 8px; font-weight: 600; color: #333; }
    label.required::after { content: ' *'; color: #dc3545; }
    .form-control { width: 100%; padding: 12px; border: 2px solid #e1e5e9; border-radius: 6px; font-size: 16px; transition: border-color 0.3s; }
    .form-control:focus { outline: none; border-color: #667eea; }
    .error-message { margin-top: 5px; }
    .error-text { color: #dc3545; font-size: 14px; }
    .required-marker { color: #dc3545; }
    .checkbox-group, .radio-group { display: flex; flex-direction: column; gap: 10px; }
    .checkbox-label, .radio-label { display: flex; align-items: center; gap: 8px; font-weight: normal; }
    .form-actions { margin-top: 30px; display: flex; justify-content: space-between; }
    .btn { padding: 12px 24px; border: none; border-radius: 6px; font-size: 16px; cursor: pointer; transition: all 0.3s; }
    .btn-primary { background: #667eea; color: white; }
    .btn-primary:hover { background: #5a6fd8; }
    .btn-secondary { background: #6c757d; color: white; }
    .btn-secondary:hover { background: #545b62; }
    .help-text { font-size: 14px; color: #6c757d; margin-top: 5px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="form-header">
      <h1>${formTitle}</h1>
      <p>Step ${currentStep} of ${maxSteps}</p>
    </div>
    
    <div class="form-body">
      <@progressIndicator current=currentStep max=maxSteps/>
      
      <form method="POST" action="/users/register">
        <input type="hidden" name="step" value="${currentStep}">
        <input type="hidden" name="${_csrf.parameterName}" value="${_csrf.token}">
        
        <#switch currentStep>
          <#case 1>
            <h2>Personal Information</h2>
            
            <@formField fieldName="firstName" label="First Name" required=true/>
            <@formField fieldName="lastName" label="Last Name" required=true/>
            
            <@formField fieldName="dateOfBirth" label="Date of Birth" type="date" required=true/>
            
            <@formField fieldName="gender" label="Gender" type="radio" options=[
              {"value": "male", "label": "Male"},
              {"value": "female", "label": "Female"},
              {"value": "other", "label": "Other"},
              {"value": "prefer_not_to_say", "label": "Prefer not to say"}
            ]/>
            
            <@formField fieldName="nationality" label="Nationality" type="select" options=[
              {"value": "US", "label": "United States"},
              {"value": "CA", "label": "Canada"},
              {"value": "UK", "label": "United Kingdom"},
              {"value": "DE", "label": "Germany"},
              {"value": "FR", "label": "France"},
              {"value": "other", "label": "Other"}
            ]/>
            <#break>
            
          <#case 2>
            <h2>Contact Details</h2>
            
            <@formField fieldName="email" label="Email Address" type="email" required=true/>
            <div class="help-text">We'll use this email for account verification</div>
            
            <@formField fieldName="phone" label="Phone Number" type="tel"/>
            
            <@formField fieldName="address.street" label="Street Address"/>
            
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
              <@formField fieldName="address.city" label="City"/>
              <@formField fieldName="address.zipCode" label="ZIP Code"/>
            </div>
            
            <@formField fieldName="address.country" label="Country" type="select" options=[
              {"value": "US", "label": "United States"},
              {"value": "CA", "label": "Canada"},
              {"value": "UK", "label": "United Kingdom"},
              {"value": "DE", "label": "Germany"},
              {"value": "FR", "label": "France"}
            ]/>
            
            <@formField fieldName="emergencyContact.name" label="Emergency Contact Name"/>
            <@formField fieldName="emergencyContact.phone" label="Emergency Contact Phone"/>
            <#break>
            
          <#case 3>
            <h2>Preferences & Interests</h2>
            
            <@formField fieldName="interests" label="Areas of Interest" type="checkbox" options=[
              {"value": "technology", "label": "Technology & Programming"},
              {"value": "design", "label": "Design & UI/UX"},
              {"value": "business", "label": "Business & Entrepreneurship"},
              {"value": "marketing", "label": "Marketing & Sales"},
              {"value": "finance", "label": "Finance & Accounting"},
              {"value": "healthcare", "label": "Healthcare & Medicine"},
              {"value": "education", "label": "Education & Training"},
              {"value": "arts", "label": "Arts & Entertainment"}
            ]/>
            
            <@formField fieldName="experience" label="Years of Experience" type="select" options=[
              {"value": "0-1", "label": "0-1 years"},
              {"value": "2-3", "label": "2-3 years"},
              {"value": "4-6", "label": "4-6 years"},
              {"value": "7-10", "label": "7-10 years"},
              {"value": "10+", "label": "10+ years"}
            ]/>
            
            <@formField fieldName="bio" label="Tell us about yourself" type="textarea"/>
            <div class="help-text">Brief description of your background and goals (optional)</div>
            
            <@formField fieldName="newsletter" label="Communication Preferences" type="checkbox" options=[
              {"value": "weekly_newsletter", "label": "Weekly newsletter"},
              {"value": "product_updates", "label": "Product updates"},
              {"value": "event_notifications", "label": "Event notifications"},
              {"value": "promotional_offers", "label": "Promotional offers"}
            ]/>
            
            <div class="form-group">
              <label>
                <input type="checkbox" name="termsAccepted" value="true" required>
                I agree to the <a href="/terms" target="_blank">Terms of Service</a> and 
                <a href="/privacy" target="_blank">Privacy Policy</a>
              </label>
            </div>
            <#break>
        </#switch>
        
        <div class="form-actions">
          <#if currentStep > 1>
            <button type="submit" name="action" value="previous" class="btn btn-secondary">
              ← Previous Step
            </button>
          <#else>
            <div></div>
          </#if>
          
          <#if currentStep < maxSteps>
            <button type="submit" name="action" value="next" class="btn btn-primary">
              Next Step →
            </button>
          <#else>
            <button type="submit" name="action" value="submit" class="btn btn-primary">
              Complete Registration
            </button>
          </#if>
        </div>
      </form>
      
      <#-- Display form errors -->
      <#if spring.status.error??>
        <div class="alert alert-danger" style="margin-top: 20px; padding: 15px; background: #f8d7da; border: 1px solid #f5c6cb; border-radius: 6px; color: #721c24;">
          <h4>Please correct the following errors:</h4>
          <ul style="margin: 10px 0 0 20px;">
            <#list spring.status.errorMessages as error>
              <li>${error}</li>
            </#list>
          </ul>
        </div>
      </#if>
      
      <#-- Debug information (development only) -->
      <#if environment!"prod" != "prod">
        <div style="margin-top: 30px; padding: 15px; background: #f8f9fa; border-radius: 6px; border-left: 4px solid #007bff;">
          <h4 style="margin: 0 0 10px 0; color: #007bff;">Debug Information</h4>
          <p><strong>Current Step:</strong> ${currentStep}</p>
          <p><strong>Form Errors:</strong> ${spring.status.error?string('Yes', 'No')}</p>
          <p><strong>CSRF Token:</strong> ${_csrf.token[0..10]}...</p>
          <#if user??>
            <p><strong>User Object:</strong> ${user?keys?join(', ')}</p>
          </#if>
        </div>
      </#if>
    </div>
  </div>

  <script>
    // Simple form validation
    document.querySelector('form').addEventListener('submit', function(e) {
      const requiredFields = document.querySelectorAll('[required]');
      let hasErrors = false;
      
      requiredFields.forEach(field => {
        if (!field.value.trim()) {
          field.style.borderColor = '#dc3545';
          hasErrors = true;
        } else {
          field.style.borderColor = '#e1e5e9';
        }
      });
      
      if (hasErrors) {
        e.preventDefault();
        alert('Please fill in all required fields.');
      }
    });
  </script>
</body>
</html>
