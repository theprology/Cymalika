Add-Type -AssemblyName System.Windows.Forms
$form=New-Object System.Windows.Forms.Form
$form.Text='Cipher computer fixture'
$form.Width=500;$form.Height=250
$inputField=New-Object System.Windows.Forms.TextBox
$inputField.AccessibleName='Cipher fixture entry';$inputField.Text='before';$inputField.Top=20;$inputField.Width=300
$button=New-Object System.Windows.Forms.Button
$button.Text='Apply fixture';$button.Top=60;$button.Width=200
$label=New-Object System.Windows.Forms.Label
$label.Text='not applied';$label.Top=110;$label.Width=350
$button.Add_Click({$label.Text='Applied '+$inputField.Text})
$form.Controls.AddRange(@($inputField,$button,$label))
[System.Windows.Forms.Application]::Run($form)
