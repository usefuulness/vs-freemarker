<#-- 
  Comprehensive FreeMarker Template Example
  This template showcases various FreeMarker features for testing the extension
-->

<#-- Import external libraries -->
<#import "lib/utils.ftl" as utils/>
<#import "lib/formatters.ftl" as fmt/>

<#-- Include header template -->
<#include "common/header.ftl"/>

<#-- Global settings -->
<#setting number_format="0.##"/>
<#setting date_format="yyyy-MM-dd"/>

<#-- Variable assignments and data structures -->
<#assign pageTitle = "User Management Dashboard"/>
<#assign currentYear = .now?string("yyyy")?number/>
<#assign isProduction = (environment!"dev") == "production"/>

<#-- Complex data structure -->
<#assign users = [
  {
    "id": 1,
    "name": "Alice Johnson", 
    "email": "alice@example.com",
    "age": 30,
    "department": "Engineering",
    "skills": ["Java", "FreeMarker", "SQL"],
    "joinDate": "2020-03-15",
    "active": true,
    "salary": 75000.50
  },
  {
    "id": 2,
    "name": "Bob Smith",
    "email": "bob@example.com", 
    "age": 28,
    "department": "Marketing",
    "skills": ["Analytics", "SEO", "Content"],
    "joinDate": "2021-06-20",
    "active": true,
    "salary": 65000.00
  },
  {
    "id": 3,
    "name": "Carol Williams",
    "email": "carol@example.com",
    "age": 35,
    "department": "Engineering", 
    "skills": ["Python", "DevOps", "Cloud"],
    "joinDate": "2019-01-10",
    "active": false,
    "salary": 85000.75
  }
]/>

<#-- Hash/Map structure -->
<#assign departments = {
  "Engineering": {"budget": 500000, "head": "John Doe"},
  "Marketing": {"budget": 200000, "head": "Jane Smith"},
  "Sales": {"budget": 300000, "head": "Mike Johnson"}
}/>

<#-- Function definitions -->
<#function calculateAge birthYear>
  <#return currentYear - birthYear/>
</#function>

<#function formatCurrency amount>
  <#return "$" + amount?string(",##0.00")/>
</#function>

<#function getExperienceLevel years>
  <#if years < 2>
    <#return "Junior"/>
  <#elseif years < 5>
    <#return "Mid-level"/>
  <#else>
    <#return "Senior"/>
  </#if>
</#function>

<#function isSkillMatch user requiredSkills>
  <#list requiredSkills as skill>
    <#if user.skills?seq_contains(skill)>
      <#return true/>
    </#if>
  </#list>
  <#return false/>
</#function>

<#-- Macro definitions -->
<#macro userCard user highlight=false>
  <div class="user-card ${highlight?string('highlighted', '')}">
    <div class="user-header">
      <h3>${user.name}</h3>
      <span class="status ${user.active?string('active', 'inactive')}">
        ${user.active?string('Active', 'Inactive')}
      </span>
    </div>
    
    <div class="user-details">
      <p><strong>Email:</strong> ${user.email}</p>
      <p><strong>Department:</strong> ${user.department}</p>
      <p><strong>Age:</strong> ${user.age}</p>
      <p><strong>Salary:</strong> ${formatCurrency(user.salary)}</p>
      <p><strong>Join Date:</strong> ${user.joinDate?date}</p>
      
      <div class="skills">
        <strong>Skills:</strong>
        <#list user.skills as skill>
          <span class="skill-tag">${skill}</span><#if skill_has_next>, </#if>
        </#list>
      </div>
    </div>
  </div>
</#macro>

<#macro departmentSummary deptName dept>
  <div class="department-summary">
    <h4>${deptName}</h4>
    <p>Budget: ${formatCurrency(dept.budget)}</p>
    <p>Head: ${dept.head}</p>
    <p>Employees: ${users?filter(u -> u.department == deptName)?size}</p>
  </div>
</#macro>

<#macro statisticsWidget>
  <#local totalUsers = users?size/>
  <#local activeUsers = users?filter(u -> u.active)?size/>
  <#local totalSalary = 0/>
  
  <#list users as user>
    <#local totalSalary = totalSalary + user.salary/>
  </#list>
  
  <div class="statistics">
    <h3>Statistics</h3>
    <div class="stat-grid">
      <div class="stat-item">
        <span class="stat-number">${totalUsers}</span>
        <span class="stat-label">Total Users</span>
      </div>
      <div class="stat-item">
        <span class="stat-number">${activeUsers}</span>
        <span class="stat-label">Active Users</span>
      </div>
      <div class="stat-item">
        <span class="stat-number">${formatCurrency(totalSalary / totalUsers)}</span>
        <span class="stat-label">Avg Salary</span>
      </div>
      <div class="stat-item">
        <span class="stat-number">${currentYear}</span>
        <span class="stat-label">Current Year</span>
      </div>
    </div>
  </div>
</#macro>

<#-- Error handling with attempt/recover -->
<#macro safeRender content>
  <#attempt>
    ${content}
  <#recover>
    <span class="error">Error rendering content</span>
  </#attempt>
</#macro>

<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${pageTitle} - ${currentYear}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; }
    .user-card { border: 1px solid #ddd; padding: 15px; margin: 10px 0; border-radius: 8px; }
    .user-card.highlighted { background-color: #f0f8ff; border-color: #007bff; }
    .status.active { color: green; font-weight: bold; }
    .status.inactive { color: red; font-weight: bold; }
    .skill-tag { background: #e9ecef; padding: 2px 6px; border-radius: 3px; }
    .stat-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; }
    .stat-item { text-align: center; padding: 15px; border: 1px solid #dee2e6; border-radius: 5px; }
    .stat-number { display: block; font-size: 2em; font-weight: bold; color: #007bff; }
    .filter-section { margin: 20px 0; padding: 15px; background: #f8f9fa; border-radius: 5px; }
    .department-summary { margin: 10px; padding: 10px; border-left: 4px solid #007bff; }
    .error { color: red; font-style: italic; }
  </style>
</head>
<body>
  <header>
    <h1>${pageTitle}</h1>
    <p>Generated on ${.now?string("yyyy-MM-dd HH:mm:ss")}</p>
    
    <#if isProduction>
      <div class="alert alert-info">Running in Production mode</div>
    <#else>
      <div class="alert alert-warning">Running in Development mode</div>
    </#if>
  </header>

  <main>
    <#-- Statistics Section -->
    <@statisticsWidget/>

    <#-- Department Overview -->
    <section class="departments">
      <h2>Departments</h2>
      <div class="department-grid">
        <#list departments?keys as deptName>
          <@departmentSummary deptName=deptName dept=departments[deptName]/>
        </#list>
      </div>
    </section>

    <#-- User Filtering and Display -->
    <section class="users">
      <h2>Users</h2>
      
      <#-- Filter by department -->
      <div class="filter-section">
        <h3>Filter by Department</h3>
        <#list departments?keys as dept>
          <div class="department-section">
            <h4>${dept} Department</h4>
            <#assign deptUsers = users?filter(u -> u.department == dept)/>
            
            <#if deptUsers?has_content>
              <p>Found ${deptUsers?size} user(s) in ${dept}</p>
              <#list deptUsers as user>
                <@userCard user=user highlight=(user.salary > 70000)/>
              </#list>
            <#else>
              <p>No users found in ${dept} department.</p>
            </#if>
          </div>
        </#list>
      </div>

      <#-- Active vs Inactive Users -->
      <div class="filter-section">
        <h3>User Status</h3>
        
        <div class="status-section">
          <h4>Active Users</h4>
          <#assign activeUsers = users?filter(u -> u.active)/>
          <#if activeUsers?has_content>
            <#list activeUsers as user>
              <@userCard user=user/>
            </#list>
          <#else>
            <p>No active users found.</p>
          </#if>
        </div>

        <div class="status-section">
          <h4>Inactive Users</h4>
          <#assign inactiveUsers = users?filter(u -> !u.active)/>
          <#if inactiveUsers?has_content>
            <#list inactiveUsers as user>
              <@userCard user=user/>
            </#list>
          <#else>
            <p>No inactive users found.</p>
          </#if>
        </div>
      </div>

      <#-- Skill-based filtering -->
      <div class="filter-section">
        <h3>Skill-based Search</h3>
        <#assign requiredSkills = ["Java", "Python"]/>
        
        <h4>Users with Java or Python skills:</h4>
        <#assign skillMatches = users?filter(u -> isSkillMatch(u, requiredSkills))/>
        
        <#if skillMatches?has_content>
          <#list skillMatches as user>
            <@userCard user=user highlight=true/>
          </#list>
        <#else>
          <p>No users found with the required skills.</p>
        </#if>
      </div>

      <#-- Salary range analysis -->
      <div class="filter-section">
        <h3>Salary Analysis</h3>
        
        <#-- Switch statement for salary categories -->
        <#list users as user>
          <div class="salary-category">
            <strong>${user.name}:</strong>
            <#switch user.salary>
              <#case 0..50000>
                Entry Level - ${formatCurrency(user.salary)}
                <#break>
              <#case 50001..75000>
                Mid Level - ${formatCurrency(user.salary)}
                <#break>
              <#case 75001..100000>
                Senior Level - ${formatCurrency(user.salary)}
                <#break>
              <#default>
                Executive Level - ${formatCurrency(user.salary)}
            </#switch>
          </div>
        </#list>
      </div>

      <#-- Advanced list operations -->
      <div class="filter-section">
        <h3>Advanced Operations</h3>
        
        <h4>Sorted by Salary (Descending):</h4>
        <#assign sortedUsers = users?sort_by("salary")?reverse/>
        <ol>
          <#list sortedUsers as user>
            <li>${user.name} - ${formatCurrency(user.salary)}</li>
          </#list>
        </ol>

        <h4>Engineering Department Stats:</h4>
        <#assign engUsers = users?filter(u -> u.department == "Engineering")/>
        <#if engUsers?has_content>
          <ul>
            <li>Total Engineers: ${engUsers?size}</li>
            <li>Average Salary: ${formatCurrency(engUsers?map(u -> u.salary)?sum / engUsers?size)}</li>
            <li>Highest Paid: ${engUsers?max_by("salary").name}</li>
            <li>Lowest Paid: ${engUsers?min_by("salary").name}</li>
          </ul>
        </#if>
      </div>
    </section>

    <#-- Nested macro example -->
    <section class="nested-example">
      <h2>Nested Processing Example</h2>
      <#list departments?keys as dept>
        <div class="nested-dept">
          <h3>${dept}</h3>
          <#assign deptUsers = users?filter(u -> u.department == dept)/>
          <#list deptUsers as user>
            <#if user.active>
              <div class="active-user">
                <@safeRender user.name/>
                <#list user.skills as skill>
                  <#if skill_index < 3>
                    <span class="top-skill">${skill}</span>
                  </#if>
                </#list>
              </div>
            </#if>
          </#list>
        </div>
      </#list>
    </section>

    <#-- Built-in functions showcase -->
    <section class="builtins">
      <h2>Built-in Functions Showcase</h2>
      
      <div class="builtin-examples">
        <h4>String Operations:</h4>
        <p>Page title length: ${pageTitle?length}</p>
        <p>Uppercase: ${pageTitle?upper_case}</p>
        <p>First word: ${pageTitle?word_list[0]}</p>
        
        <h4>Date Operations:</h4>
        <p>Current time: ${.now?string("HH:mm:ss")}</p>
        <p>ISO date: ${.now?string("yyyy-MM-dd'T'HH:mm:ss")}</p>
        
        <h4>Number Operations:</h4>
        <#assign totalSalary = users?map(u -> u.salary)?sum/>
        <p>Total payroll: ${totalSalary?string(",##0.00")}</p>
        <p>Average age: ${users?map(u -> u.age)?sum / users?size}</p>
        
        <h4>Collection Operations:</h4>
        <p>All departments: ${departments?keys?join(", ")}</p>
        <p>All skills: ${users?map(u -> u.skills)?flatten?seq_index_of("Java") != -1}</p>
      </div>
    </section>
  </main>

  <footer>
    <p>&copy; ${currentYear} User Management System</p>
    <p>
      Template processed at ${.now?string("yyyy-MM-dd HH:mm:ss")} 
      <#if .template_name??>
        | Template: ${.template_name}
      </#if>
    </p>
    
    <#-- Conditional environment info -->
    <#if !isProduction>
      <div class="debug-info">
        <strong>Debug Info:</strong>
        <ul>
          <li>Total variables: ${.vars?size}</li>
          <li>FreeMarker version: ${.version}</li>
          <li>Data model keys: ${.data_model?keys?size}</li>
        </ul>
      </div>
    </#if>
  </footer>

  <#-- Include footer template -->
  <#include "common/footer.ftl"/>
</body>
</html>