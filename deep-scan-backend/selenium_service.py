from flask import Flask, request, jsonify
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.chrome.options import Options
import time
import os
import sys

app = Flask(__name__)

def simulate_user_actions(driver, analysis, depth=0, max_depth=2):
    """Recursively simulate user actions on a page"""
    if depth > max_depth:
        return

    try:
        # Find all clickable elements
        elements = driver.find_elements(By.XPATH, "//a | //button | //input[@type='submit'] | //input[@type='button']")
        print(f"Found {len(elements)} interactive elements at depth {depth}")
        
        for idx, el in enumerate(elements[:10]):  # Limit to first 10 elements to avoid too much recursion
            try:
                text = el.text or el.get_attribute('value') or ''
                href = el.get_attribute('href')
                
                # Only follow links that navigate to a new page
                if href and href.startswith('http'):
                    print(f"Opening link: {href}")
                    # Open in new tab
                    driver.execute_script("window.open(arguments[0]);", href)
                    driver.switch_to.window(driver.window_handles[-1])
                    time.sleep(2)
                    
                    # Try to find forms and fill them
                    forms = driver.find_elements(By.TAG_NAME, "form")
                    for form in forms:
                        inputs = form.find_elements(By.TAG_NAME, "input")
                        for input in inputs:
                            input_type = input.get_attribute('type')
                            if input_type in ['text', 'email']:
                                try:
                                    input.clear()
                                    input.send_keys('test@example.com')
                                except:
                                    pass
                            elif input_type == 'password':
                                try:
                                    input.clear()
                                    input.send_keys('Test1234!')
                                except:
                                    pass
                        
                        try:
                            form.submit()
                        except:
                            pass
                        
                        time.sleep(1)
                    
                    # Try to find download links
                    downloads = []
                    download_links = driver.find_elements(By.XPATH, "//a[@download]")
                    for dl in download_links:
                        downloads.append(dl.get_attribute('href'))
                    
                    analysis.append({
                        'action': 'visit',
                        'url': href,
                        'title': driver.title,
                        'forms': len(forms),
                        'downloads': downloads,
                        'status': 'visited',
                        'depth': depth
                    })
                    
                    if depth < max_depth:
                        # Recursively simulate on the new page (limited depth)
                        simulate_user_actions(driver, analysis, depth + 1, max_depth)
                    
                    # Close tab and return to main tab
                    driver.close()
                    driver.switch_to.window(driver.window_handles[0])
                else:
                    # For non-link elements, record but don't follow
                    analysis.append({
                        'action': 'click',
                        'element': el.get_attribute('outerHTML'),
                        'text': text,
                        'status': 'skipped',
                        'reason': 'No valid href or not a link',
                        'depth': depth
                    })
            except Exception as e:
                print(f"Error processing element: {e}")
                analysis.append({
                    'action': 'error',
                    'element': str(el.get_attribute('outerHTML'))[:100],
                    'error': str(e),
                    'depth': depth
                })
    except Exception as e:
        print(f"Error finding elements: {e}")
        analysis.append({
            'action': 'error',
            'error': str(e),
            'depth': depth
        })

@app.route('/deep-scan', methods=['POST'])
def deep_scan():
    """Handle deep scan requests"""
    url = request.json.get('url')
    if not url:
        return jsonify({'error': 'No URL provided'}), 400

    print(f"Starting deep scan of {url}")
    
    options = Options()
    options.add_argument("--start-maximized")
    
    # Look for chromedriver in the current directory first
    script_dir = os.path.dirname(os.path.abspath(__file__))
    chromedriver_path = os.path.join(script_dir, "chromedriver.exe")
    
    driver = None
    analysis = []
    
    try:
        # Try to use chromedriver from the current directory
        if os.path.exists(chromedriver_path):
            service = Service(chromedriver_path)
            driver = webdriver.Chrome(service=service, options=options)
        else:
            # Fall back to PATH
            driver = webdriver.Chrome(options=options)
        
        print("Chrome browser launched successfully")
        
        driver.get(url)
        time.sleep(2)
        
        # Simulate user actions recursively
        simulate_user_actions(driver, analysis)
        
        driver.quit()
        print(f"Scan completed with {len(analysis)} findings")
        return jsonify({'analysis': analysis})
    
    except Exception as e:
        print(f"Error in deep scan: {e}")
        if driver:
            driver.quit()
        return jsonify({'error': str(e), 'trace': str(sys.exc_info())}), 500

if __name__ == '__main__':
    print("Starting Python Selenium service on port 5000")
    app.run(port=5000, debug=True)
